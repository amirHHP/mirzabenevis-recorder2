import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE_KEY = 'SOTOON_API_KEY';
const MODEL_STORAGE_KEY = 'SELECTED_MODEL';
const BASE_URL = 'https://api.intelligence.sotoon.ir/inference/v1';

export interface AIModel {
  id: string;
  name: string;
}

// --- API Key Management ---

export const getApiKey = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = async (key: string): Promise<void> => {
  await AsyncStorage.setItem(API_KEY_STORAGE_KEY, key);
};

// --- Model Management ---

export const getSelectedModel = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(MODEL_STORAGE_KEY);
};

export const setSelectedModel = async (modelId: string): Promise<void> => {
  await AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
};

// --- Fetch Available Models ---

export const fetchModels = async (): Promise<AIModel[]> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not set.');
  }

  try {
    const response = await fetch(`${BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch models: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // OpenAI-compatible /models endpoint returns { data: [...] }
    const models = (data.data || data || []).map((m: any) => ({
      id: m.id || m.model,
      name: m.id || m.name || m.model,
    }));
    return models;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    throw error;
  }
};

// --- Chat Completion (OpenAI-compatible) ---

const chatCompletion = async (messages: { role: string; content: string }[]): Promise<string> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not set. Please configure it in settings.');
  }

  const modelId = await getSelectedModel();
  if (!modelId) {
    throw new Error('No model selected. Please select a model in settings.');
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response received.';
  } catch (error) {
    console.error('Chat completion error:', error);
    throw error;
  }
};

// --- Transcription ---

export const transcribeAudio = async (audioUri: string): Promise<string> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not set. Please configure it in settings.');
  }

  // Try the /audio/transcriptions endpoint (Whisper-compatible)
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    
    const modelId = await getSelectedModel();
    formData.append('model', modelId || 'whisper-1');
    formData.append('language', 'fa');

    const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return data.text || '';
    }
    
    // If audio endpoint fails, fall back to chat
    console.log('Audio endpoint returned:', response.status);
  } catch (e) {
    console.log('Audio transcription endpoint not available, falling back to chat...', e);
  }

  // Fallback: read file as base64 and send via chat
  try {
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return await chatCompletion([
      {
        role: 'system',
        content: 'شما یک دستیار هوشمند برای رونویسی و خلاصه‌سازی جلسات هستید. به زبان فارسی پاسخ دهید مگر اینکه متن اصلی انگلیسی باشد.',
      },
      {
        role: 'user',
        content: `لطفاً این فایل صوتی که به صورت base64 ارسال شده را رونویسی کنید. فقط متن رونویسی‌شده را خروجی دهید:\n\n${base64Audio.substring(0, 5000)}`,
      },
    ]);
  } catch (fileError) {
    console.log('File reading failed, using simple chat fallback');
    return await chatCompletion([
      {
        role: 'system',
        content: 'شما یک دستیار هوشمند برای رونویسی و خلاصه‌سازی جلسات هستید.',
      },
      {
        role: 'user',
        content: 'متأسفانه فایل صوتی قابل پردازش نبود. لطفاً پیام خطا نمایش دهید.',
      },
    ]);
  }
};

// --- Q&A about Transcript ---

export const askQuestionAboutTranscript = async (transcript: string, question: string): Promise<string> => {
  return await chatCompletion([
    {
      role: 'system',
      content: 'شما دستیار هوشمند جلسات هستید. بر اساس متن جلسه ارائه‌شده به سوالات کاربر پاسخ دهید. پاسخ‌ها را به همان زبان سوال بنویسید. دقیق و مختصر باشید.',
    },
    {
      role: 'user',
      content: `متن جلسه:\n\n"""${transcript}"""\n\nسوال: ${question}`,
    },
  ]);
};
