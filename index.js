import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  TWILIO_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE,
  N8N_CHAT_WEBHOOK
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

app.post('/sms', async (req, res) => {
  const phone = req.body.From;
  const incomingMessage = req.body.Body?.trim();

  try {
    // 1. Find or create lead
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('phone_number', phone)
      .single();

    if (!lead) {
      const insert = await supabase
        .from('leads')
        .insert([{ phone_number: phone }])
        .select()
        .single();
      lead = insert.data;
    }

    // 2. Create thread_id if not present
    if (!lead.thread_id) {
      const threadResponse = await axios.post(
        'https://api.openai.com/v1/threads',
        {},
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v1'
          }
        }
      );

      const thread_id = threadResponse.data.id;

      await supabase.from('leads').update({ thread_id }).eq('id', lead.id);
      lead.thread_id = thread_id;
    }

    // 3. Store user message
    await supabase.from('conversations').insert([
      {
        lead_id: lead.id,
        role: 'user',
        content: incomingMessage
      }
    ]);

    // 4. Forward message to N8N (to run OpenAI assistant)
    const { data } = await axios.post(N8N_CHAT_WEBHOOK, {
      phone,
      message: incomingMessage,
      thread_id: lead.thread_id,
      lead_id: lead.id
    });

    const assistantReply = data.reply;

    // 5. Save assistant reply
    await supabase.from('conversations').insert([
      {
        lead_id: lead.id,
        role: 'assistant',
        content: assistantReply
      }
    ]);

    // 6. Send back to user
    await twilioClient.messages.create({
      body: assistantReply,
      from: TWILIO_PHONE,
      to: phone
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('Error:', err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
