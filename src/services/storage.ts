import AsyncStorage from '@react-native-async-storage/async-storage';
import { Meeting } from '../types';

const MEETINGS_KEY = 'MEETINGS_DATA';

export const getMeetings = async (): Promise<Meeting[]> => {
  try {
    const data = await AsyncStorage.getItem(MEETINGS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load meetings", error);
    return [];
  }
};

export const saveMeeting = async (meeting: Meeting): Promise<void> => {
  try {
    const meetings = await getMeetings();
    const existingIndex = meetings.findIndex(m => m.id === meeting.id);
    if (existingIndex >= 0) {
      meetings[existingIndex] = meeting;
    } else {
      meetings.unshift(meeting); // Add new at the beginning
    }
    await AsyncStorage.setItem(MEETINGS_KEY, JSON.stringify(meetings));
  } catch (error) {
    console.error("Failed to save meeting", error);
    throw error;
  }
};

export const deleteMeeting = async (id: string): Promise<void> => {
  try {
    const meetings = await getMeetings();
    const updatedMeetings = meetings.filter(m => m.id !== id);
    await AsyncStorage.setItem(MEETINGS_KEY, JSON.stringify(updatedMeetings));
  } catch (error) {
    console.error("Failed to delete meeting", error);
    throw error;
  }
};
