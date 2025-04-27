import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

export const saveMessage = async (message: any) => {
  try {
    const response = await axios.post(
      `${process.env.HOST_URL}/api/message/text`,
      message, // Send message as the request body
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message saved:', response.data);
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

export const message_client = async (data: any, phone_number_id: string, token: string) => {
  try {
    const message = {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": `${data.phone_number}`,
      "type": `${data.type}`,
      "text": {
        // "preview_url": <ENABLE_LINK_PREVIEW>,
        "body": `${data.content}`
      }
    }
    const response = await axios.post(
      `${process.env.FACEBOOK_BASE_URL}${process.env.FACEBOOK_API_VERSION}/${phone_number_id}/messages`,
      message,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

export const updateMessageStatus = async (wamid: string, status: string) => {
  try {
    const response = await axios.put(
      `${process.env.HOST_URL}/api/message/text`,
      { wamid, status }, // Send message as the request body
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message Updated:', response.data);
  } catch (error) {
    console.error('Error saving message:', error);
  }
}