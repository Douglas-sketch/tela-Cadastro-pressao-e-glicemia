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
  
  if (sys <= 100 && dia <= 80) return { status: 'Normal', color: '#22c55e', emoji: '✓', level: 'good' };
  if (sys <= 130 && dia <= 85) return { status: 'Elevada', color: '#f59e0b', emoji: '⚠️', level: 'warning' };
  if (sys <= 140 && dia <= 90) return { status: 'Estágio 1', color: '#ef4444', emoji: '⚠️', level: 'danger' };
  return { status: 'Estágio 2', color: '#dc2626', emoji: '🚨', level: 'critical' };
};

const getGlycemiaStatus = (value) => {
  if (!value) return null;
  
  const num = Number(value);
  
  if (num < 70) return { status: 'Hipoglicemia', color: '#0ea5e9', emoji: '⚠️', level: 'warning' };
  if (num < 100) return { status: 'Normal (Jejum)', color: '#22c55e', emoji: '✓', level: 'good' };
  if (num < 126) return { status: 'Normal (Pós-refeição)', color: '#22c55e', emoji: '✓', level: 'good' };
  if (num < 200) return { status: 'Elevada', color: '#f59e0b', emoji: '⚠️', level: 'warning' };
  return { status: 'Hiperglicemia', color: '#dc2626', emoji: '🚨', level: 'critical' };
};

const getCombinedRiskCategory = (pressureStatus, glycemiaStatus) => {
  if (!pressureStatus || !glycemiaStatus) return null;
  
  const levels = { good: 0, warning: 1, danger: 2, critical: 3 };
  const pressureLevel = levels[pressureStatus.level] || 0;
  const glycemiaLevel = levels[glycemiaStatus.level] || 0;
  const combinedLevel = Math.max(pressureLevel, glycemiaLevel);
  
  const riskCategories = {
    0: { status: 'Baixo Risco', color: '#22c55e', emoji: '✓', recommendation: 'Continue mantendo hábitos saudáveis!' },
    1: { status: 'Risco Moderado', color: '#f59e0b', emoji: '⚠️', recommendation: 'Fique atento aos valores e mantenha monitoramento.' },
    2: { status: 'Risco Elevado', color: '#ef4444', emoji: '⚠️', recommendation: 'Considere consultar um médico para avaliação.' },
    3: { status: 'Risco Crítico', color: '#dc2626', emoji: '🚨', recommendation: 'Procure atendimento médico urgente!' }
  };
  
  return riskCategories[combinedLevel];
};

const getHealthTip = (pressureStatus, glycemiaStatus, period) => {
  const tips = [];
  
  if (pressureStatus) {
    if (pressureStatus.level === 'critical') {
      tips.push('⚠️ Pressão muito alta - Repita a medição em 15 minutos');
    } else if (pressureStatus.level === 'danger') {
      tips.push('📉 Pressão elevada - Tente relaxar e repita a medição');
    } else if (pressureStatus.level === 'warning') {
      tips.push('💧 Pressão levemente elevada - Hidrate-se e descanse');
    }
  }
  
  if (glycemiaStatus) {
    if (glycemiaStatus.status === 'Hipoglicemia') {
      tips.push('🍬 Hipoglicemia - Consuma algo com açúcar imediatamente');
    } else if (glycemiaStatus.status === 'Hiperglicemia') {
      tips.push('🚰 Hiperglicemia - Beba água e evite carboidratos');
    } else if (period === 'Em Jejum' && glycemiaStatus.level === 'good') {
      tips.push('✨ Glicemia de jejum excelente - Continue assim!');
    }
  }
  
  if (period === 'Depois do Almoço' || period === 'Depois do Jantar') {
    tips.push('🍽️ Pós-refeição - Aguarde 2h para medição mais precisa');
  }
  
  return tips.length > 0 ? tips.slice(0, 2) : ['💡 Preencha os valores para receber dicas personalizadas'];
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

const InputField = ({ label, value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, maxLength, required, style, editable = true, showCharCount = false, onReset, statusColor, onSubmitEditing }) => (
  <View style={styles.fieldGroup}>
    <View style={styles.labelRow}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <View style={styles.labelActions}>
        {value && <Text style={styles.checkmark}>✓</Text>}
        {onReset && value && (
          <TouchableOpacity onPress={onReset} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
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
      onSubmitEditing={onSubmitEditing}
      style={[styles.input, multiline && styles.textArea, value && styles.inputFilled, statusColor && { borderColor: statusColor, backgroundColor: `${statusColor}15` }, style]}
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
  const [dailyGoal, setDailyGoal] = useState(3);
  const [sessionCount, setSessionCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const systolicRef = useRef(null);
  const diastolicRef = useRef(null);
  const glycemiaRef = useRef(null);
  const notesRef = useRef(null);

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
  const combinedRisk = getCombinedRiskCategory(pressureStatus, glycemiaStatus);
  const healthTips = getHealthTip(pressureStatus, glycemiaStatus, period);

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
      setSessionCount(prev => prev + 1);
      
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
    setShowPreview(false);
  };

  const handleFieldReset = (setter) => {
    setter('');
  };

  const togglePreview = () => {
    setShowPreview(!showPreview);
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
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Cadastro de Saúde</Text>
              <Text style={styles.subtitle}>Pressão Arterial e Glicemia</Text>
            </View>
            <View style={styles.dailyProgress}>
              <Text style={styles.progressText}>{sessionCount}/{dailyGoal}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min((sessionCount / dailyGoal) * 100, 100)}%` }]} />
              </View>
            </View>
          </View>

          <InputField
            label="Data e Hora"
            value={formatDisplayDateTime(dateTime)}
            onChangeText={(text) => setDateTime(parseDisplayDateTimeToISO(text))}
            placeholder="dd/mm/aaaa hh:mm"
            keyboardType="numbers-and-punctuation"
            editable={true}
            onReset={() => handleFieldReset(setDateTime)}
          />

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <FieldLabel required>Pressão Arterial</FieldLabel>
              <View style={styles.labelActions}>
                {(systolic || diastolic) && (
                  <TouchableOpacity onPress={() => { handleFieldReset(setSystolic); handleFieldReset(setDiastolic); }} style={styles.resetButton}>
                    <Text style={styles.resetButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.pressureRow}>
              <TextInput
                ref={systolicRef}
                value={systolic}
                onChangeText={(text) => setSystolic(sanitizeNumericInput(text, 3))}
                placeholder="120"
                keyboardType="numeric"
                maxLength={3}
                onSubmitEditing={() => diastolicRef.current?.focus()}
                style={[styles.input, styles.pressureInput, systolic && styles.inputFilled, pressureStatus && { borderColor: pressureStatus.color, backgroundColor: `${pressureStatus.color}15` }]}
              />
              <Text style={styles.pressureSeparator}>/</Text>
              <TextInput
                ref={diastolicRef}
                value={diastolic}
                onChangeText={(text) => setDiastolic(sanitizeNumericInput(text, 3))}
                placeholder="80"
                keyboardType="numeric"
                maxLength={3}
                onSubmitEditing={() => glycemiaRef.current?.focus()}
                style={[styles.input, styles.pressureInput, diastolic && styles.inputFilled, pressureStatus && { borderColor: pressureStatus.color, backgroundColor: `${pressureStatus.color}15` }]}
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
            onReset={() => handleFieldReset(setGlycemia)}
            statusColor={glycemiaStatus?.color}
            onSubmitEditing={() => notesRef.current?.focus()}
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
            onReset={() => handleFieldReset(setNotes)}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

          {combinedRisk && (
            <View style={[styles.riskCard, { borderColor: combinedRisk.color, backgroundColor: `${combinedRisk.color}10` }]}>
              <View style={styles.riskHeader}>
                <Text style={styles.riskEmoji}>{combinedRisk.emoji}</Text>
                <Text style={[styles.riskTitle, { color: combinedRisk.color }]}>{combinedRisk.status}</Text>
              </View>
              <Text style={styles.riskRecommendation}>{combinedRisk.recommendation}</Text>
            </View>
          )}

          {healthTips.length > 0 && (
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>💡 Dicas de Saúde</Text>
              {healthTips.map((tip, index) => (
                <Text key={index} style={styles.tipItem}>{tip}</Text>
              ))}
            </View>
          )}

          {showPreview && (systolic || diastolic || glycemia) && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>📋 Pré-visualização do Registro</Text>
              <View style={styles.previewContent}>
                <Text style={styles.previewLabel}>Data/Hora:</Text>
                <Text style={styles.previewValue}>{formatDisplayDateTime(dateTime)}</Text>
                
                <Text style={styles.previewLabel}>Pressão:</Text>
                <Text style={styles.previewValue}>{systolic || '-'}/{diastolic || '-'} mmHg</Text>
                
                <Text style={styles.previewLabel}>Glicemia:</Text>
                <Text style={styles.previewValue}>{glycemia || '-'} mg/dL</Text>
                
                <Text style={styles.previewLabel}>Período:</Text>
                <Text style={styles.previewValue}>{period}</Text>
                
                {notes && (
                  <>
                    <Text style={styles.previewLabel}>Notas:</Text>
                    <Text style={styles.previewValue}>{notes}</Text>
                  </>
                )}
              </View>
            </View>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.previewButton}
              onPress={togglePreview}
              activeOpacity={0.8}
            >
              <Text style={styles.previewButtonText}>
                {showPreview ? '📋 Ocultar Pré-visualização' : '👁️ Ver Pré-visualização'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.goalButton}
              onPress={() => setDailyGoal(prev => prev >= 5 ? 1 : prev + 1)}
              activeOpacity={0.8}
            >
              <Text style={styles.goalButtonText}>🎯 Meta: {dailyGoal}/dia</Text>
            </TouchableOpacity>
          </View>

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  dailyProgress: {
    alignItems: 'flex-end',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#376b9d',
    marginBottom: 4,
  },
  progressBar: {
    width: 60,
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 3,
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
  labelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
  },
  resetButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  resetButtonText: {
    color: '#dc2626',
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
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  previewButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  goalButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  riskCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 14,
    marginBottom: 16,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  riskEmoji: {
    fontSize: 20,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  riskRecommendation: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  tipsContainer: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 13,
    color: '#0c4a6e',
    marginBottom: 4,
    lineHeight: 18,
  },
  previewCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  previewContent: {
    gap: 6,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  previewValue: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 8,
  },
});
