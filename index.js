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
  N8N_CHAT_WEBHOOK,
  OPENAI_API_KEY
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

async function logToSupabase({ phone, type, message, thread_id, lead_id }) {
  const { error } = await supabase.from('logs').insert([
    {
      phone_number: phone,
      type,
      message,
      thread_id,
      lead_id
    }
  ]);

  if (error) {
    console.error('Failed to write to logs:', error.message);
  }
}

app.post('/sms', async (req, res) => {
  const phone = req.body.From;
  const incomingMessage = req.body.Body?.trim();

  console.log(`Incoming from ${phone}: ${incomingMessage}`);

  try {
    await logToSupabase({
      phone,
      type: 'incoming',
      message: incomingMessage
    });

    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('phone_number', phone)
      .single();

    if (!lead) {
      console.log('Creating new lead...');
      const insert = await supabase
        .from('leads')
        .insert([{ phone_number: phone }])
        .select()
        .single();
      lead = insert.data;
    }

    if (!lead.thread_id) {
      console.log('Creating new thread...');
      const threadResponse = await axios.post(
        'https://api.openai.com/v1/threads',
        {},
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v1'
          }
        }
      );

      const thread_id = threadResponse.data.id;
      await supabase.from('leads').update({ thread_id }).eq('id', lead.id);
      lead.thread_id = thread_id;

      await logToSupabase({
        phone,
        type: 'thread_created',
        message: `Thread created: ${thread_id}`,
        thread_id,
        lead_id: lead.id
      });
    } else {
      console.log(`Using existing thread: ${lead.thread_id}`);
    }

    await supabase.from('conversations').insert([
      {
        lead_id: lead.id,
        role: 'user',
        content: incomingMessage
      }
    ]);

    console.log('Forwarding to N8N...');
    const { data } = await axios.post(N8N_CHAT_WEBHOOK, {
      phone,
      message: incomingMessage,
      thread_id: lead.thread_id,
      lead_id: lead.id
    });

    const assistantReply = data.reply;
    console.log(`Assistant reply: ${assistantReply}`);

    await logToSupabase({
      phone,
      type: 'assistant_reply',
      message: assistantReply,
      thread_id: lead.thread_id,
      lead_id: lead.id
    });

    await supabase.from('conversations').insert([
      {
        lead_id: lead.id,
        role: 'assistant',
        content: assistantReply
      }
    ]);

    await twilioClient.messages.create({
      body: assistantReply,
      from: TWILIO_PHONE,
      to: phone
    });

    console.log('Reply sent successfully');
    res.sendStatus(200);
  } catch (err) {
    console.error('Error in /sms route:', err.message);

    await logToSupabase({
      phone,
      type: 'error',
      message: err.message
    });

    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on https://javascript-node-730199417968.us-central1.run.app${PORT}`));