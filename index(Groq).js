import express from "express";
import pkg from "body-parser";
const { json, urlencoded } = pkg;
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import axios from "axios";
// import { Message } from "twilio/lib/twiml/MessagingResponse";

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
  GROQ_KEY,
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

// Health Check FIRST (Cloud Run Friendly)
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.status(200).send("OK");
});

async function logToSupabase({ phone, type, message, lead_id }) {
  await supabase
    .from("logs")
    .insert([{ phone_number: phone, type, message, lead_id }]);
}

// OUTBOUND FIRST CONTACT FLOW
app.post("/sms-agent/send-initial", async (req, res) => {
  // Get all new leads from SB
  const { data: newLeads } = await supabase.from("new leads").select("*");
  console.log("newLeads", newLeads);
  if (!newLeads || newLeads.length === 0) {
    return res.status(200).json({ success: true, message: "No new leads" });
  }

  const leadsInserted = [];
  const leadsNotInserted = [];

  // Loops through all leads and sends initial message
  for (const lead of newLeads) {
    const { phone, first_name } = lead;

    // Check if lead already exists in leads table  by phone number
    const { data: currentLead } = await supabase
      .from("leads")
      .select("*")
      .eq("phone", phone)
      .single();

    if (currentLead) {
      console.log(`Lead already exists: ${lead}`, lead);
      leadsNotInserted.push(lead);
      // Remove from New leads now that it's in leads.
      await supabase.from("new leads").delete().eq("id", lead.id);
      // Skip to next lead
      continue;
    }
    // Insert new lead & generate thread ID
    const { data: insertedLead } = await supabase
      .from("leads")
      .insert(lead)
      .select()
      .single();
    // Remove from New leads now that it's in leads.
    await supabase.from("new leads").delete().eq("id", lead.id);

    // Send initial message based on client_id
    const client_id = lead.client_id;
    console.log(`Fetching prompt for client_id: ${client_id}, type: initial`);
    console.log(`client_id type: ${typeof client_id}`);
    
    // Make sure client_id is treated as a number
    const numericClientId = Number(client_id);
    console.log(`Numeric client_id: ${numericClientId}, type: ${typeof numericClientId}`);
    
    try {
      // Fetch client-specific initial message
      const { data: initialMessage, error } = await supabase
        .from("prompts")
        .select("prompt")
        .eq("type", "initial")
        .eq("client_id", numericClientId)
        .single();
      
      if (error) {
        console.error(`Error fetching initial message for client_id ${numericClientId}:`, error);
        console.error(`Error details:`, JSON.stringify(error));
        continue; // Skip this lead if we can't find a prompt for it
      }
      
      if (!initialMessage) {
        console.error(`No initial message found for client_id ${numericClientId}`);
        continue; // Skip this lead if we can't find a prompt for it
      }
      
      console.log("initialMessage", initialMessage);
      // intermpolate first_name into initialMessage
      const processedMessage = initialMessage.prompt.replace(
        "{{first_name}}",
        first_name,
      );
      await twilioClient.messages.create({
        body: processedMessage,
        from: TWILIO_PHONE,
        to: phone,
      });

      leadsInserted.push({
        phone: phone,
        first_name: first_name,
      });
    } catch (err) {
      console.error(`Unexpected error processing lead with client_id ${numericClientId}:`, err);
      continue; // Skip this lead if there's an error
    }
  }
  res.status(200).json({
    success: true,
    inserted: leadsInserted,
    not_inserted: leadsNotInserted,
  });
});

// INBOUND USER REPLY FLOW
app.post("/sms", async (req, res) => {
  console.log("Message from Twilio", req.body);
  const phone = req.body.From;
  const message = req.body.Body?.trim();

  if (!phone || !message)
    return res.status(400).send("Missing phone or message");

  let { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!lead) {
    // For new leads coming from inbound messages, we need to determine the client_id
    // You'll need to implement logic to determine which client this lead belongs to
    // This could be based on the phone number, message content, or other factors
    
    // For example, you might query another table to determine the client_id
    // const { data: clientMapping } = await supabase
    //   .from("client_phone_mappings")
    //   .select("client_id")
    //   .eq("phone_prefix", phone.substring(0, 6))
    //   .single();
    
    // const client_id = clientMapping?.client_id;
    
    // For now, we'll assume you have a way to determine the client_id
    // Replace this with your actual logic to determine the client_id
    const client_id = req.body.To; // Example: using the Twilio number the user texted as a way to identify the client
    
    if (!client_id) {
      return res.status(400).send("Unable to determine client_id for new lead");
    }
    
    const { data: newLead } = await supabase
      .from("leads")
      .insert([{
        phone: phone,
        client_id: client_id
      }])
      .select()
      .single();
    lead = newLead;
  }

  await logToSupabase({
    phone,
    type: "incoming",
    message,
    lead_id: lead.id,
  });
  await supabase
    .from("conversations")
    .insert([{ lead_id: lead.id, role: "user", content: message }]);
  // Get Conversation History
  const { data: history } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("lead_id", lead.id);
  
  // Get client_id from the lead
  const client_id = lead.client_id;
  console.log(`Fetching prompts for client_id: ${client_id}`);
  
  // Make sure client_id is treated as a number
  const numericClientId = Number(client_id);
  console.log(`Numeric client_id: ${numericClientId}, type: ${typeof numericClientId}`);
  
  // Fetch client-specific prompts
  const { data: prompts, error: promptsError } = await supabase
    .from("prompts")
    .select("prompt, type")
    .in("type", ["initial", "system"])
    .eq("client_id", numericClientId);
  
  // If no prompts found, log a warning
  if (promptsError) {
    console.warn(`Error fetching prompts for client_id ${numericClientId}:`, promptsError);
    console.warn(`Error details:`, JSON.stringify(promptsError));
  }
  
  if (!prompts || prompts.length === 0) {
    console.warn(`No prompts found for client_id: ${numericClientId}`);
  }
  
  for (const prompt of prompts || []) {
    if (prompt.type === "initial") {
      history.unshift({ role: "user", content: prompt.prompt });
    } else if (prompt.type === "system") {
      history.unshift({ role: "system", content: prompt.prompt });
    } else {
      throw new Error(`Unknown prompt type "${prompt.type}"`);
    }
  }
 
  // Send to Groq
  const messages = [...history, { role: "user", content: message }];
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      // model: "llama-3.2-1b-preview",
      temperature: 1,
      max_completion_tokens: 512,
      messages: messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + GROQ_KEY,
      },
    },
  );

  console.log("Groq Response", response.data);
  console.log("Groq message", response.data?.choices?.[0]?.message);
  const assistantReply = response.data?.choices?.[0]?.message?.content;
  if (!assistantReply) throw new Error("No reply from assistant");

  await logToSupabase({
    phone,
    type: "assistant",
    message: assistantReply,
    lead_id: lead.id,
  });

  await supabase
    .from("conversations")
    .insert([{ lead_id: lead.id, role: "assistant", content: assistantReply }]);

  // Add 20 second delay before sending SMS
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  await twilioClient.messages.create({
    body: assistantReply,
    from: TWILIO_PHONE,
    to: phone,
  });

  res.status(200).send();
});

// Global Error Handler LAST
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("server running on ${PORT}");
});
