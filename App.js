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

const MEDICATION_FREQUENCY_OPTIONS = [
  'Uma vez ao dia',
  'Duas vezes ao dia',
  'Três vezes ao dia',
  'Quatro vezes ao dia',
  'A cada 8 horas',
  'A cada 12 horas',
  'A cada 24 horas',
  'Conforme necessário',
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

const getHealthTip = (pressureStatus, glycemiaStatus, period, medications) => {
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
  
  if (medications && medications.length > 0) {
    tips.push(`💊 ${medications.length} medicamento(s) registrado(s) - Mantenha o tratamento em dia`);
  }
  
  return tips.length > 0 ? tips.slice(0, 2) : ['💡 Preencha os valores para receber dicas personalizadas'];
};

const FieldLabel = ({ children, required = false }) => {
  return (
    <Text style={styles.label}>
      {children}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  );
};

const FeedbackBadge = ({ status, color, emoji }) => {
  if (!status) return null;
  
  return (
    <View style={[styles.feedbackBadge, { borderColor: color }]}>
      <Text style={[styles.feedbackEmoji]}>{emoji}</Text>
      <Text style={[styles.feedbackText, { color }]}>{status}</Text>
    </View>
  );
};

const InputField = ({ label, value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, maxLength, required, style, editable = true, showCharCount = false, onReset, statusColor, onSubmitEditing }) => {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.labelRow}>
        <FieldLabel required={required}>{label}</FieldLabel>
        <View style={styles.labelActions}>
          {value ? <Text style={styles.checkmark}>✓</Text> : null}
          {onReset && value ? (
            <TouchableOpacity onPress={onReset} style={styles.resetButton}>
              <Text style={styles.resetButtonText}>✕</Text>
            </TouchableOpacity>
          ) : null}
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
      {showCharCount && maxLength ? (
        <Text style={styles.charCount}>{value.length}/{maxLength}</Text>
      ) : null}
    </View>
  );
};

export default function App() {
  const [dateTime, setDateTime] = useState(getCurrentDateTimeValue());
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glycemia, setGlycemia] = useState('');
  const [period, setPeriod] = useState('Antes do Almoço');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(3);
  const [sessionCount, setSessionCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Estados para medicamentos  
  const [medications, setMedications] = useState([]);
  const [medicationName, setMedicationName] = useState('');
  const [medicationDosage, setMedicationDosage] = useState('');
  const [medicationFrequency, setMedicationFrequency] = useState('Uma vez ao dia');
  const [medicationNotes, setMedicationNotes] = useState('');
  const [showMedicationForm, setShowMedicationForm] = useState(false);
  
  const systolicRef = useRef(null);
  const diastolicRef = useRef(null);
  const glycemiaRef = useRef(null);
  const notesRef = useRef(null);
  const medicationNameRef = useRef(null);
  const medicationDosageRef = useRef(null);

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
  const healthTips = getHealthTip(pressureStatus, glycemiaStatus, period, medications);

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
      setSessionCount(prev => prev + 1);
      handleClear();
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
    setShowPreview(false);
    setMedications([]);
    setMedicationName('');
    setMedicationDosage('');
    setMedicationFrequency('Uma vez ao dia');
    setMedicationNotes('');
    setShowMedicationForm(false);
  };

  const handleFieldReset = (setter) => {
    setter('');
  };

  // Funções para gerenciar medicamentos
  const handleAddMedication = () => {
    // Validar nome do medicamento
    if (!medicationName.trim()) {
      Alert.alert('Campo obrigatório', 'Por favor, informe o nome do medicamento.');
      return;
    }

    const newMedication = {
      id: Date.now(),
      name: medicationName.trim(),
      dosage: medicationDosage.trim(),
      frequency: medicationFrequency,
      notes: medicationNotes.trim(),
    };

    setMedications([...medications, newMedication]);
    
    // Limpar formulário
    setMedicationName('');
    setMedicationDosage('');
    setMedicationFrequency('Uma vez ao dia');
    setMedicationNotes('');
    setShowMedicationForm(false);
  };

  const handleRemoveMedication = (id) => {
    setMedications(medications.filter(med => med.id !== id));
  };

  const handleClearMedicationForm = () => {
    setMedicationName('');
    setMedicationDosage('');
    setMedicationFrequency('Uma vez ao dia');
    setMedicationNotes('');
    setShowMedicationForm(false);
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
              <Text style={styles.subtitle}>Pressão Arterial, Glicemia e Medicamentos</Text>
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
                {(systolic || diastolic) ? (
                  <TouchableOpacity onPress={() => { handleFieldReset(setSystolic); handleFieldReset(setDiastolic); }} style={styles.resetButton}>
                    <Text style={styles.resetButtonText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
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
                style={[styles.input, styles.pressureInput, systolic ? styles.inputFilled : null, pressureStatus ? { borderColor: pressureStatus.color, backgroundColor: `${pressureStatus.color}15` } : null]}
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
                style={[styles.input, styles.pressureInput, diastolic ? styles.inputFilled : null, pressureStatus ? { borderColor: pressureStatus.color, backgroundColor: `${pressureStatus.color}15` } : null]}
              />
            </View>
            {pressureStatus ? <FeedbackBadge {...pressureStatus} /> : null}
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
            statusColor={glycemiaStatus ? glycemiaStatus.color : null}
            onSubmitEditing={() => notesRef.current?.focus()}
          />
          {glycemiaStatus ? <FeedbackBadge {...glycemiaStatus} /> : null}

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
                    style={[styles.optionButton, selected ? styles.optionButtonSelected : null]}
                  >
                    <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option}</Text>
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

          {/* Seção de Medicamentos */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <FieldLabel>💊 Medicamentos em Uso</FieldLabel>
              <TouchableOpacity 
                onPress={() => setShowMedicationForm(!showMedicationForm)}
                style={styles.addMedicationButton}
              >
                <Text style={styles.addMedicationButtonText}>
                  {showMedicationForm ? '−' : '+'}
                </Text>
              </TouchableOpacity>
            </View>

            {showMedicationForm ? (
              <View style={styles.medicationForm}>
                <InputField
                  label="Nome do Medicamento"
                  value={medicationName}
                  onChangeText={setMedicationName}
                  placeholder="Ex: Metformina"
                  required
                  ref={medicationNameRef}
                  onSubmitEditing={() => medicationDosageRef.current?.focus()}
                />
                
                <InputField
                  label="Dosagem"
                  value={medicationDosage}
                  onChangeText={setMedicationDosage}
                  placeholder="Ex: 500mg, 1 comprimido"
                  ref={medicationDosageRef}
                />
                
                <View style={styles.fieldGroup}>
                  <FieldLabel>Frequência</FieldLabel>
                  <View style={styles.optionGrid}>
                    {MEDICATION_FREQUENCY_OPTIONS.map((option) => {
                      const selected = medicationFrequency === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          activeOpacity={0.8}
                          onPress={() => setMedicationFrequency(option)}
                          style={[styles.optionButton, selected ? styles.optionButtonSelected : null]}
                        >
                          <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                
                <InputField
                  label="Observações do Medicamento"
                  value={medicationNotes}
                  onChangeText={setMedicationNotes}
                  placeholder="Ex: Tomar antes das refeições, evitar álcool..."
                  multiline
                  numberOfLines={3}
                  maxLength={150}
                  showCharCount={true}
                />
                
                <View style={styles.medicationFormActions}>
                  <TouchableOpacity 
                    style={styles.cancelMedicationButton}
                    onPress={handleClearMedicationForm}
                  >
                    <Text style={styles.cancelMedicationButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.addMedicationSubmitButton}
                    onPress={handleAddMedication}
                  >
                    <Text style={styles.addMedicationSubmitButtonText}>Adicionar Medicamento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Lista de medicamentos adicionados */}
            {medications.length > 0 ? (
              <View style={styles.medicationsList}>
                {medications.map((med) => (
                  <View key={med.id} style={styles.medicationItem}>
                    <View style={styles.medicationItemContent}>
                      <Text style={styles.medicationItemName}>{med.name}</Text>
                      {med.dosage ? <Text style={styles.medicationItemDetail}>Dosagem: {med.dosage}</Text> : null}
                      <Text style={styles.medicationItemDetail}>Frequência: {med.frequency}</Text>
                      {med.notes ? <Text style={styles.medicationItemNotes}>{med.notes}</Text> : null}
                    </View>
                    <TouchableOpacity 
                      onPress={() => handleRemoveMedication(med.id)}
                      style={styles.removeMedicationButton}
                    >
                      <Text style={styles.removeMedicationButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {combinedRisk ? (
            <View style={[styles.riskCard, { borderColor: combinedRisk.color, backgroundColor: `${combinedRisk.color}10` }]}>
              <View style={styles.riskHeader}>
                <Text style={styles.riskEmoji}>{combinedRisk.emoji}</Text>
                <Text style={[styles.riskTitle, { color: combinedRisk.color }]}>{combinedRisk.status}</Text>
              </View>
              <Text style={styles.riskRecommendation}>{combinedRisk.recommendation}</Text>
            </View>
          ) : null}

          {healthTips.length > 0 ? (
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>💡 Dicas de Saúde</Text>
              {healthTips.map((tip, index) => (
                <Text key={index} style={styles.tipItem}>{tip}</Text>
              ))}
            </View>
          ) : null}

          {showPreview && (systolic || diastolic || glycemia) ? (
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
                
                {medications.length > 0 ? (
                  <>
                    <Text style={styles.previewLabel}>Medicamentos:</Text>
                    {medications.map((med, index) => (
                      <View key={med.id} style={styles.previewMedication}>
                        <Text style={styles.previewValue}>{index + 1}. {med.name}</Text>
                        {med.dosage ? <Text style={styles.previewValue}>   Dosagem: {med.dosage}</Text> : null}
                        <Text style={styles.previewValue}>   Frequência: {med.frequency}</Text>
                        {med.notes ? <Text style={styles.previewValue}>   Obs: {med.notes}</Text> : null}
                      </View>
                    ))}
                  </>
                ) : null}
                
                {notes ? (
                  <>
                    <Text style={styles.previewLabel}>Notas:</Text>
                    <Text style={styles.previewValue}>{notes}</Text>
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

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
    boxShadow: '0px 8px 18px rgba(28, 58, 93, 0.08)',
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
    boxShadow: '0px 2px 4px rgba(223, 234, 245, 0.4)',
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
  saveButton: {
    backgroundColor: '#2f8cff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 12px rgba(47, 140, 255, 0.28)',
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
  previewMedication: {
    marginBottom: 12,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
  },
  addMedicationButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMedicationButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  medicationForm: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  medicationFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelMedicationButton: {
    flex: 1,
    backgroundColor: '#94a3b8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelMedicationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  addMedicationSubmitButton: {
    flex: 2,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMedicationSubmitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  medicationsList: {
    marginTop: 12,
    gap: 8,
  },
  medicationItem: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'flex-start',
  },
  medicationItemContent: {
    flex: 1,
  },
  medicationItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
  },
  medicationItemDetail: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 2,
  },
  medicationItemNotes: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  removeMedicationButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  removeMedicationButtonText: {
    fontSize: 16,
  },
});
