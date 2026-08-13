import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const PERIOD_OPTIONS = [
  'Em Jejum',
  'Antes do Almoço',
  'Depois do Almoço',
  'Antes do Jantar',
  'Depois do Jantar',
  'Outro',
];

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

const sanitizeNumericInput = (text, maxLength) => text.replace(/\D/g, '').slice(0, maxLength);

const FieldLabel = ({ children, required = false }) => (
  <Text style={styles.label}>
    {children}
    {required ? <Text style={styles.required}> *</Text> : null}
  </Text>
);

const InputField = ({ label, value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, maxLength, required, style, editable = true }) => (
  <View style={styles.fieldGroup}>
    <FieldLabel required={required}>{label}</FieldLabel>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={numberOfLines}
      maxLength={maxLength}
      editable={editable}
      style={[styles.input, multiline && styles.textArea, style]}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
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

  const handleSave = () => {
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

    setErrorMessage('');

    const payload = {
      dataHora: formatDisplayDateTime(dateTime),
      pressao: {
        sistolica: Number(systolic),
        diastolica: Number(diastolic),
      },
      glicemia: Number(glycemia),
      periodo: period,
      notas: notes.trim(),
    };

    Alert.alert('Registro salvo', JSON.stringify(payload, null, 2));
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
            onChangeText={(text) => setDateTime(text)}
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
                style={[styles.input, styles.pressureInput]}
              />
              <Text style={styles.pressureSeparator}>/</Text>
              <TextInput
                value={diastolic}
                onChangeText={(text) => setDiastolic(sanitizeNumericInput(text, 3))}
                placeholder="80"
                keyboardType="numeric"
                maxLength={3}
                style={[styles.input, styles.pressureInput]}
              />
            </View>
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
            style={styles.noteInput}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.9}>
            <Text style={styles.saveButtonText}>Salvar Registro</Text>
          </TouchableOpacity>
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
  required: {
    color: '#d94d4d',
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
  saveButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
