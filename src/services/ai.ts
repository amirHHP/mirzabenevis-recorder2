import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE_KEY = 'GEMINI_API_KEY';

export const getApiKey = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = async (key: string): Promise<void> => {
  await AsyncStorage.setItem(API_KEY_STORAGE_KEY, key);
};

export const transcribeAudio = async (audioUri: string): Promise<string> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not set. Please configure it in settings.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  try {
    // Read audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const prompt = "Please transcribe the following audio recording accurately. It might be in Persian (Farsi) or English. Please output ONLY the transcribed text.";
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/mp4", // expo-av records in m4a/mp4 by default on many platforms
          data: base64Audio
        }
      }
    ]);
    
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};

export const askQuestionAboutTranscript = async (transcript: string, question: string): Promise<string> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not set.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Here is the transcript of a meeting:\n\n"""\n${transcript}\n"""\n\nBased ONLY on the transcript above, please answer the following question in the same language as the question:\nQuestion: ${question}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Question error:", error);
    throw error;
  }
};
