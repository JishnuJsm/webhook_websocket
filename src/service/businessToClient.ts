import { message_client, saveMessage } from "../backend/text_message"

export const sendTextMessage = async (data: any, token: string) => {
    try {
        const response = await message_client(data, data.phone_number_id, token)
        saveMessage({ ...data, sender: 'out', wamid: response?.messages[0]?.id, status: 'SENT' })
    } catch (error) {
        console.error("Error sending message:", error)
    }
}