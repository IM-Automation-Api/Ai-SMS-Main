import express from 'express';
import pkg from 'body-parser';
const { json, urlencoded } = pkg;
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import axios from 'axios';

config();

const app = express();
app.use(urlencoded({ extended: false }));
app.use(json());

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  TWILIO_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE,
  N8N_CHAT_WEBHOOK,
  N8N_INITIAL_WEBHOOK,
  OPENAI_API_KEY,
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

// Health Check FIRST (Cloud Run Friendly)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
});

async function logToSupabase({ phone, type, message, thread_id, lead_id }) {
  await supabase.from('logs').insert([{ phone_number: phone, type, message, thread_id, lead_id }]);
}

// OUTBOUND FIRST CONTACT FLOW
app.post('/sms-agent/send-initial', async (req, res) => {
  const { phone, first_name } = req.body;

  if (!phone || !first_name) return res.status(400).json({ error: 'Missing phone or first_name' });

  const { data: existingLead } = await supabase.from('leads').select('*').eq('phone_number', phone).maybeSingle();

  if (existingLead) {
    await supabase.from('new leads').delete().eq('phone_number', phone);
    return res.status(200).json({ message: 'Lead already exists', lead_id: existingLead.id });
  }

  const { data: newLead } = await supabase.from('new leads').select('*').eq('phone_number', phone).maybeSingle();
  if (!newLead) return res.status(404).json({ error: 'Lead not found in new leads' });

  const thread = await axios.post('https://api.openai.com/v1/threads', {}, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'OpenAI-Beta': 'assistants=v2' },
  });

  const { data: insertedLead } = await supabase.from('leads')
    .insert({ phone_number: phone, first_name, thread_id: thread.data.id })
    .select().single();

  await supabase.from('new leads').delete().eq('id', newLead.id);

  await logToSupabase({ phone, type: 'thread_created', message: `Thread created: ${thread.data.id}`, thread_id: thread.data.id, lead_id: insertedLead.id });

  const response = await axios.post(N8N_INITIAL_WEBHOOK, {
    phone, thread_id: thread.data.id, lead_id: insertedLead.id, first_name,
  });

  const assistantReply = response.data?.reply;
  if (!assistantReply) throw new Error('No reply from assistant');

  await logToSupabase({ phone, type: 'assistant_reply', message: assistantReply, thread_id: thread.data.id, lead_id: insertedLead.id });

  await supabase.from('conversations').insert([{ lead_id: insertedLead.id, role: 'assistant', content: assistantReply }]);

  await twilioClient.messages.create({ body: assistantReply, from: TWILIO_PHONE, to: phone });

  res.status(200).json({ success: true, lead_id: insertedLead.id, thread_id: thread.data.id });
});

// INBOUND USER REPLY FLOW
app.post('/sms', async (req, res) => {
  const phone = req.body.From;
  const message = req.body.Body?.trim();

  if (!phone || !message) return res.status(400).send('Missing phone or message');

  let { data: lead } = await supabase.from('leads').select('*').eq('phone_number', phone).single();

  if (!lead) {
    const { data: newLead } = await supabase.from('leads').insert([{ phone_number: phone }]).select().single();
    lead = newLead;
  }

  if (!lead.thread_id) {
    const thread = await axios.post('https://api.openai.com/v1/threads', {}, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'OpenAI-Beta': 'assistants=v2' },
    });
    await supabase.from('leads').update({ thread_id: thread.data.id }).eq('id', lead.id);
    lead.thread_id = thread.data.id;
  }

  await logToSupabase({ phone, type: 'incoming', message, thread_id: lead.thread_id, lead_id: lead.id });

  const response = await axios.post(N8N_CHAT_WEBHOOK, {
    phone, message, thread_id: lead.thread_id, lead_id: lead.id,
  });

  const assistantReply = response.data?.reply;
  if (!assistantReply) throw new Error('No reply from assistant');

  await logToSupabase({ phone, type: 'assistant_reply', message: assistantReply, thread_id: lead.thread_id, lead_id: lead.id });

  await supabase.from('conversations').insert([{ lead_id: lead.id, role: 'assistant', content: assistantReply }]);

  await twilioClient.messages.create({ body: assistantReply, from: TWILIO_PHONE, to: phone });

  res.status(200).send();
});

// Global Error Handler LAST
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server live → http://0.0.0.0:${PORT}`);
});
