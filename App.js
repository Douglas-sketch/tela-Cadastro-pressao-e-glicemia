import React, { useState, useRef, useEffect } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabaseClient';

const PERIOD_OPTIONS = [
  'Em Jejum',
  'Antes do Almoço',
  'Depois do Almoço',
  'Antes do Jantar',
  'Depois do Jantar',
  'Outro',
];

const MEDICAL_LIMITS = {
  systolic: { min: 70, max: 200 },
  diastolic: { min: 40, max: 130 },
  glycemia: { min: 40, max: 400 },
};

const getCurrentDateTimeValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const formatDisplayDateTime = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const parseDisplayDateTimeToISO = (displayValue) => {
  if (!displayValue) return getCurrentDateTimeValue();

  // Tenta parsear formato manual: dd/mm/aaaa hh:mm
  const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s(\d{1,2}):(\d{2})$/;
  const match = displayValue.match(regex);

  if (match) {
    const [, day, month, year, hour, minute] = match;
    const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}`;
    const date = new Date(isoString);
    if (!Number.isNaN(date.getTime())) {
      return isoString;
    }
  }

  // Se não conseguir parsear, retorna o valor como está (provavelmente ISO)
  return displayValue || getCurrentDateTimeValue();
};

const sanitizeNumericInput = (text, maxLength) => text.replace(/\D/g, '').slice(0, maxLength);

// Funções de feedback de saúde
const getPressureStatus = (systolic, diastolic) => {
  if (!systolic || !diastolic) return null;
  
  const sys = Number(systolic);
  const dia = Number(diastolic);
  
  if (sys <= 100 && dia <= 80) return { status: 'Normal', color: '#22c55e', emoji: '✓' };
  if (sys <= 130 && dia <= 85) return { status: 'Elevada', color: '#f59e0b', emoji: '⚠️' };
  if (sys <= 140 && dia <= 90) return { status: 'Estágio 1', color: '#ef4444', emoji: '⚠️' };
  return { status: 'Estágio 2', color: '#dc2626', emoji: '🚨' };
};

const getGlycemiaStatus = (value) => {
  if (!value) return null;
  
  const num = Number(value);
  
  if (num < 70) return { status: 'Hipoglicemia', color: '#0ea5e9', emoji: '⚠️' };
  if (num < 100) return { status: 'Normal (Jejum)', color: '#22c55e', emoji: '✓' };
  if (num < 126) return { status: 'Normal (Pós-refeição)', color: '#22c55e', emoji: '✓' };
  if (num < 200) return { status: 'Elevada', color: '#f59e0b', emoji: '⚠️' };
  return { status: 'Hiperglicemia', color: '#dc2626', emoji: '🚨' };
};

const FieldLabel = ({ children, required = false }) => (
  <Text style={styles.label}>
    {children}
    {required ? <Text style={styles.required}> *</Text> : null}
  </Text>
);

const FeedbackBadge = ({ status, color, emoji }) => {
  if (!status) return null;
  
  return (
    <View style={[styles.feedbackBadge, { borderColor: color }]}>
      <Text style={[styles.feedbackEmoji]}>{emoji}</Text>
      <Text style={[styles.feedbackText, { color }]}>{status}</Text>
    </View>
  );
};

const InputField = ({ label, value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, maxLength, required, style, editable = true, showCharCount = false }) => (
  <View style={styles.fieldGroup}>
    <View style={styles.labelRow}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {value && <Text style={styles.checkmark}>✓</Text>}
    </View>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={numberOfLines}
      maxLength={maxLength}
      editable={editable}
      style={[styles.input, multiline && styles.textArea, value && styles.inputFilled, style]}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor="#8fa6b5"
    />
    {showCharCount && maxLength && (
      <Text style={styles.charCount}>{value.length}/{maxLength}</Text>
    )}
  </View>
);

export default function App() {
  const [dateTime, setDateTime] = useState(getCurrentDateTimeValue());
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glycemia, setGlycemia] = useState('');
  const [period, setPeriod] = useState('Antes do Almoço');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const pressureStatus = getPressureStatus(systolic, diastolic);
  const glycemiaStatus = getGlycemiaStatus(glycemia);

  const handleSave = async () => {
    const hasPressure = systolic.trim() !== '' && diastolic.trim() !== '';
    const hasGlycemia = glycemia.trim() !== '';

    if (!hasPressure || !hasGlycemia) {
      const message = !hasPressure && !hasGlycemia
        ? 'Preencha a pressão arterial e a glicemia antes de salvar.'
        : !hasPressure
          ? 'Preencha a pressão arterial completa antes de salvar.'
          : 'Preencha a glicemia antes de salvar.';

      setErrorMessage(message);
      Alert.alert('Dados incompletos', message);
      return;
    }

    // Validar ranges médicos
    const systolicNum = Number(systolic);
    const diastolicNum = Number(diastolic);
    const glycemiaNum = Number(glycemia);

    if (
      systolicNum < MEDICAL_LIMITS.systolic.min ||
      systolicNum > MEDICAL_LIMITS.systolic.max ||
      diastolicNum < MEDICAL_LIMITS.diastolic.min ||
      diastolicNum > MEDICAL_LIMITS.diastolic.max ||
      glycemiaNum < MEDICAL_LIMITS.glycemia.min ||
      glycemiaNum > MEDICAL_LIMITS.glycemia.max
    ) {
      const message = `Valores fora do intervalo aceitável. Pressão: ${MEDICAL_LIMITS.systolic.min}-${MEDICAL_LIMITS.systolic.max}/${MEDICAL_LIMITS.diastolic.min}-${MEDICAL_LIMITS.diastolic.max} mmHg. Glicemia: ${MEDICAL_LIMITS.glycemia.min}-${MEDICAL_LIMITS.glycemia.max} mg/dL.`;
      setErrorMessage(message);
      Alert.alert('Valores inválidos', message);
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const isoDateTime = parseDisplayDateTimeToISO(dateTime);

      // Salvar no Supabase
      const { data, error } = await supabase
        .from('health_records')
        .insert([
          {
            data_hora: isoDateTime,
            sistolica: systolicNum,
            diastolica: diastolicNum,
            glicemia: glycemiaNum,
            periodo: period,
            notas: notes.trim() || null,
          }
        ]);

      if (error) {
        throw error;
      }

      setIsLoading(false);
      animatePress();
      setSuccessMessage('✓ Registro salvo com sucesso!');
      
      Alert.alert(
        '📊 Registro Salvo',
        `Pressão: ${systolicNum}/${diastolicNum} mmHg\nGlicemia: ${glycemiaNum} mg/dL\nPeríodo: ${period}`,
        [{ text: 'OK', onPress: handleClear }]
      );
    } catch (error) {
      setIsLoading(false);
      const errorMsg = error.message || 'Erro ao salvar no servidor. Tente novamente.';
      setErrorMessage(errorMsg);
      Alert.alert('❌ Erro', errorMsg);
      console.error('Erro ao salvar:', error);
    }
  };

  const handleClear = () => {
    setSystolic('');
    setDiastolic('');
    setGlycemia('');
    setNotes('');
    setPeriod('Antes do Almoço');
    setDateTime(getCurrentDateTimeValue());
    setErrorMessage('');
    setSuccessMessage('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Cadastro de Saúde</Text>
          <Text style={styles.subtitle}>Pressão Arterial e Glicemia</Text>

          <InputField
            label="Data e Hora"
            value={formatDisplayDateTime(dateTime)}
            onChangeText={(text) => setDateTime(parseDisplayDateTimeToISO(text))}
            placeholder="dd/mm/aaaa hh:mm"
            keyboardType="numbers-and-punctuation"
            editable={true}
          />

          <View style={styles.fieldGroup}>
            <FieldLabel required>Pressão Arterial</FieldLabel>
            <View style={styles.pressureRow}>
              <TextInput
                value={systolic}
                onChangeText={(text) => setSystolic(sanitizeNumericInput(text, 3))}
                placeholder="120"
                keyboardType="numeric"
                maxLength={3}
                style={[styles.input, styles.pressureInput, systolic && styles.inputFilled]}
              />
              <Text style={styles.pressureSeparator}>/</Text>
              <TextInput
                value={diastolic}
                onChangeText={(text) => setDiastolic(sanitizeNumericInput(text, 3))}
                placeholder="80"
                keyboardType="numeric"
                maxLength={3}
                style={[styles.input, styles.pressureInput, diastolic && styles.inputFilled]}
              />
            </View>
            {pressureStatus && <FeedbackBadge {...pressureStatus} />}
          </View>

          <InputField
            label="Glicemia"
            value={glycemia}
            onChangeText={(text) => setGlycemia(sanitizeNumericInput(text, 4))}
            placeholder="Ex: 96"
            keyboardType="numeric"
            required
            style={styles.glycemiaInput}
          />
          {glycemiaStatus && <FeedbackBadge {...glycemiaStatus} />}

          <View style={styles.fieldGroup}>
            <FieldLabel>Período / Momento</FieldLabel>
            <View style={styles.optionGrid}>
              {PERIOD_OPTIONS.map((option) => {
                const selected = period === option;
                return (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.8}
                    onPress={() => setPeriod(option)}
                    style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <InputField
            label="Notas / Sintomas"
            value={notes}
            onChangeText={setNotes}
            placeholder="Descreva sintomas, alimentação, atividade física ou observações relevantes..."
            multiline
            numberOfLines={5}
            maxLength={250}
            showCharCount={true}
            style={styles.noteInput}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity 
              style={[styles.saveButton, isLoading && styles.saveButtonDisabled]} 
              onPress={handleSave} 
              activeOpacity={0.9}
              disabled={isLoading}
            >
              <Text style={styles.saveButtonText}>
                {isLoading ? '⏳ Salvando...' : '💾 Salvar Registro'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf6ff',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#1c3a5d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#173a5a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#4b6b85',
    marginBottom: 22,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f3554',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
  },
  required: {
    color: '#d94d4d',
  },
  inputFilled: {
    borderColor: '#56b993',
    backgroundColor: '#f0fdf4',
  },
  charCount: {
    fontSize: 12,
    color: '#8fa6b5',
    marginTop: 4,
    textAlign: 'right',
  },
  feedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fb',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    gap: 6,
  },
  feedbackEmoji: {
    fontSize: 14,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f7fbff',
    borderWidth: 1,
    borderColor: '#dfeaf5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#102a43',
    shadowColor: '#dfeaf5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 1,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  pressureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressureInput: {
    flex: 1,
    width: '42%',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  pressureSeparator: {
    fontSize: 28,
    fontWeight: '700',
    color: '#376b9d',
    marginHorizontal: 12,
  },
  glycemiaInput: {
    width: '100%',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d3e4f5',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonSelected: {
    backgroundColor: '#dff4eb',
    borderColor: '#56b993',
  },
  optionText: {
    fontSize: 12,
    color: '#35506d',
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#115e43',
  },
  noteInput: {
    minHeight: 120,
  },
  errorText: {
    color: '#b42318',
    backgroundColor: '#fff0f0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f9c2c2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  successText: {
    color: '#15803d',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#2f8cff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2f8cff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  saveButtonDisabled: {
    backgroundColor: '#93c5fd',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
