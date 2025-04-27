import { saveMessage } from "../backend/text_message"

export const receiveTextMessage = async (data: any) => {
    try {
        await saveMessage(data)
    } catch (error) {
        console.error("Error sending message:", error)
    }
}