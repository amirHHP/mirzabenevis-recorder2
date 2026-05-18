import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, FlatList, TextInput, ScrollView, Alert, ActivityIndicator, I18nManager } from 'react-native';
import { Audio } from 'expo-av';
import { Mic, Square, Settings, ChevronRight, MessageSquare, Trash2, Check, FileText } from 'lucide-react-native';
import { getMeetings, saveMeeting, deleteMeeting } from './src/services/storage';
import { getApiKey, setApiKey, transcribeAudio, askQuestionAboutTranscript } from './src/services/ai';
import { Meeting } from './src/types';

// Force RTL layout for Farsi
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'RECORDING' | 'DETAIL' | 'SETTINGS'>('HOME');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    loadMeetings();
    loadApiKey();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (recording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recording]);

  const loadMeetings = async () => {
    const data = await getMeetings();
    setMeetings(data);
  };

  const loadApiKey = async () => {
    const key = await getApiKey();
    if (key) setApiKeyInput(key);
  };

  const handleSaveApiKey = async () => {
    await setApiKey(apiKeyInput);
    Alert.alert("ذخیره شد", "کلید API با موفقیت ذخیره شد");
    setCurrentScreen('HOME');
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(recording);
        setRecordingDuration(0);
        setCurrentScreen('RECORDING');
      } else {
        Alert.alert("خطای دسترسی", "لطفاً دسترسی میکروفون را مجاز کنید.");
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;

      const newMeeting: Meeting = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        title: `جلسه ${new Date().toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })}`,
        transcript: '',
        audioUri: uri,
        highlights: []
      };

      await saveMeeting(newMeeting);
      await loadMeetings();
      
      setCurrentScreen('HOME');
      
      Alert.alert(
        "جلسه ذخیره شد",
        "آیا می‌خواهید متن جلسه الان توسط هوش مصنوعی استخراج شود؟",
        [
          { text: "بعداً", style: "cancel" },
          { text: "استخراج متن", onPress: () => {
              setSelectedMeeting(newMeeting);
              setCurrentScreen('DETAIL');
              handleTranscribe(newMeeting);
            } 
          }
        ]
      );
    } catch (error) {
      console.error('Failed to stop recording', error);
      setRecording(null);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert("حذف جلسه", "آیا مطمئن هستید که می‌خواهید این جلسه را حذف کنید؟", [
      { text: "انصراف", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await deleteMeeting(id);
        await loadMeetings();
        if (currentScreen === 'DETAIL') setCurrentScreen('HOME');
      }}
    ]);
  };

  const handleTranscribe = async (meeting: Meeting) => {
    if (!meeting.audioUri) return;
    
    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudio(meeting.audioUri);
      const updatedMeeting = { ...meeting, transcript };
      await saveMeeting(updatedMeeting);
      await loadMeetings();
      
      if (selectedMeeting?.id === meeting.id) {
        setSelectedMeeting(updatedMeeting);
      }
    } catch (error) {
      console.error("Transcription failed", error);
      Alert.alert("خطا در استخراج متن", "تولید متن با مشکل مواجه شد. از درستی API Key و اتصال اینترنت مطمئن شوید.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!selectedMeeting || !chatQuestion.trim()) return;
    setIsAsking(true);
    setChatAnswer('');
    try {
      const answer = await askQuestionAboutTranscript(selectedMeeting.transcript, chatQuestion);
      setChatAnswer(answer);
    } catch (error) {
      Alert.alert("خطا", "ارتباط با هوش مصنوعی برقرار نشد.");
    } finally {
      setIsAsking(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderHome = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerGreeting}>روز بخیر،</Text>
          <Text style={styles.headerTitle}>میرزابنویس</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={() => setCurrentScreen('SETTINGS')}>
          <Settings color="#334155" size={24} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={meetings}
        contentContainerStyle={styles.listContainer}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.meetingCard}
            onPress={() => {
              setSelectedMeeting(item);
              setCurrentScreen('DETAIL');
            }}
          >
            <View style={styles.meetingCardHeader}>
              <View style={styles.meetingIconContainer}>
                {item.transcript ? <FileText color="#10b981" size={20} /> : <Mic color="#3b82f6" size={20} />}
              </View>
              <View style={styles.meetingInfo}>
                <Text style={styles.meetingTitle}>{item.title}</Text>
                <Text style={styles.meetingDate}>{new Date(item.date).toLocaleDateString('fa-IR')} • {new Date(item.date).toLocaleTimeString('fa-IR', { hour: '2-digit', minute:'2-digit' })}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Trash2 color="#ef4444" size={20} />
              </TouchableOpacity>
            </View>
            <Text numberOfLines={2} style={styles.meetingPreview}>
              {item.transcript ? item.transcript : "هنوز متنی استخراج نشده است. برای تولید کلیک کنید."}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
              <Mic color="#94a3b8" size={48} />
            </View>
            <Text style={styles.emptyTextTitle}>هیچ جلسه‌ای وجود ندارد</Text>
            <Text style={styles.emptyTextSub}>برای شروع ضبط اولین جلسه خود، دکمه میکروفون را لمس کنید.</Text>
          </View>
        }
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={startRecording}>
          <Mic color="#ffffff" size={32} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRecording = () => (
    <View style={styles.recordingContainer}>
      <View style={styles.rippleOuter}>
        <View style={styles.rippleInner}>
          <Mic color="#ffffff" size={48} />
        </View>
      </View>
      
      <Text style={styles.recordingTime}>{formatTime(recordingDuration)}</Text>
      <Text style={styles.recordingText}>در حال گوش دادن به جلسه شما...</Text>
      
      <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
        <Square color="#ffffff" size={24} fill="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const renderDetail = () => {
    if (!selectedMeeting) return null;
    return (
      <View style={styles.container}>
        <View style={styles.headerCompact}>
          <TouchableOpacity onPress={() => setCurrentScreen('HOME')} style={styles.backButton}>
            <ChevronRight color="#334155" size={28} />
          </TouchableOpacity>
          <Text style={styles.headerTitleCompact} numberOfLines={1}>{selectedMeeting.title}</Text>
          <View style={{width: 28}} />
        </View>

        <ScrollView style={styles.detailScroll} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📝 متن جلسه (هوش مصنوعی)</Text>
            {selectedMeeting.transcript ? (
              <Text style={styles.transcriptText} selectable={true}>
                {selectedMeeting.transcript}
              </Text>
            ) : (
              <View style={styles.transcribePrompt}>
                <Text style={styles.transcribeDesc}>متن این جلسه هنوز ایجاد نشده است. هوش مصنوعی ما می‌تواند فایل صوتی را با دقت بالا به متن تبدیل کند.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => handleTranscribe(selectedMeeting)} disabled={isTranscribing}>
                  {isTranscribing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>تولید متن جلسه</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>💬 سوال از دستیار هوشمند</Text>
            <Text style={styles.chatDesc}>هر سوالی درباره مباحث مطرح شده در این جلسه دارید بپرسید.</Text>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="مثال: تسک‌های مربوط به من چه بود؟"
                placeholderTextColor="#94a3b8"
                value={chatQuestion}
                onChangeText={setChatQuestion}
                multiline
              />
              <TouchableOpacity 
                style={[styles.sendButton, (!chatQuestion.trim() || isAsking) && styles.sendButtonDisabled]} 
                onPress={handleAskQuestion} 
                disabled={isAsking || !chatQuestion.trim()}
              >
                {isAsking ? <ActivityIndicator color="#fff" size="small" /> : <MessageSquare color="#ffffff" size={20} />}
              </TouchableOpacity>
            </View>
            
            {chatAnswer ? (
              <View style={styles.answerBox}>
                <Text style={styles.answerLabel}>پاسخ هوش مصنوعی:</Text>
                <Text style={styles.answerText}>{chatAnswer}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderSettings = () => (
    <View style={styles.container}>
      <View style={styles.headerCompact}>
        <TouchableOpacity onPress={() => setCurrentScreen('HOME')} style={styles.backButton}>
          <ChevronRight color="#334155" size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCompact}>تنظیمات</Text>
        <View style={{width: 28}} />
      </View>
      
      <View style={styles.settingsContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ارتباط با هوش مصنوعی</Text>
          <Text style={styles.settingsDesc}>
            اپلیکیشن میرزابنویس برای هوشمندسازی و پردازش متن از مدل Gemini استفاده می‌کند. لطفاً API Key خود را وارد کنید.
          </Text>
          
          <Text style={styles.label}>توکن دسترسی (API Key)</Text>
          <TextInput
            style={styles.settingsInput}
            placeholder="AIzaSy..."
            placeholderTextColor="#94a3b8"
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveApiKey}>
            <Check color="#ffffff" size={20} style={{marginLeft: 8}} />
            <Text style={styles.btnText}>ذخیره تنظیمات</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {currentScreen === 'HOME' && renderHome()}
      {currentScreen === 'RECORDING' && renderRecording()}
      {currentScreen === 'DETAIL' && renderDetail()}
      {currentScreen === 'SETTINGS' && renderSettings()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9' },
  headerGreeting: { fontSize: 14, color: '#64748b', fontWeight: '500', marginBottom: 4, textAlign: 'left' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'left' },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  
  listContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  meetingCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#64748b', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  meetingCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  meetingIconContainer: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  meetingInfo: { flex: 1 },
  meetingTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4, textAlign: 'left' },
  meetingDate: { fontSize: 13, color: '#94a3b8', fontWeight: '500', textAlign: 'left' },
  meetingPreview: { fontSize: 14, color: '#475569', lineHeight: 22, textAlign: 'left' },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTextTitle: { fontSize: 20, fontWeight: '700', color: '#334155', marginBottom: 12, textAlign: 'center' },
  emptyTextSub: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  
  fabContainer: { position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' },
  fab: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  
  recordingContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  rippleOuter: { width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(59, 130, 246, 0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  rippleInner: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.8, shadowRadius: 30, elevation: 15 },
  recordingTime: { fontSize: 48, fontWeight: '300', color: '#ffffff', marginBottom: 12, fontVariant: ['tabular-nums'] },
  recordingText: { fontSize: 16, color: '#94a3b8', marginBottom: 60, letterSpacing: 0.5 },
  stopButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  
  headerCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: '#f1f5f9' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitleCompact: { fontSize: 18, fontWeight: '700', color: '#0f172a', flex: 1, textAlign: 'center' },
  
  detailScroll: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#64748b', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16, textAlign: 'left' },
  transcriptText: { fontSize: 15, lineHeight: 28, color: '#334155', textAlign: 'left' },
  transcribePrompt: { alignItems: 'center', paddingVertical: 10 },
  transcribeDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  
  primaryBtn: { backgroundColor: '#3b82f6', flexDirection: 'row', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', width: '100%' },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  
  chatDesc: { fontSize: 14, color: '#64748b', marginBottom: 16, textAlign: 'left' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  chatInput: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, paddingTop: 16, fontSize: 15, minHeight: 60, color: '#0f172a', textAlign: 'right' },
  sendButton: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  sendButtonDisabled: { backgroundColor: '#94a3b8' },
  answerBox: { backgroundColor: '#eff6ff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  answerLabel: { fontSize: 13, fontWeight: '700', color: '#2563eb', marginBottom: 8, textAlign: 'left' },
  answerText: { fontSize: 15, color: '#1e3a8a', lineHeight: 24, textAlign: 'left' },
  
  settingsContent: { padding: 16 },
  settingsDesc: { fontSize: 14, color: '#64748b', lineHeight: 22, marginBottom: 24, textAlign: 'left' },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8, textAlign: 'left' },
  settingsInput: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 24, color: '#0f172a', textAlign: 'left' },
});
