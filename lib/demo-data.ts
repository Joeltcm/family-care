export type ProfileId = string;

export const profiles = [
  { id: 'familia', name: 'Familia', initials: 'FC', color: '#0b6f69' },
  { id: 'joel', name: 'Joel', initials: 'JT', color: '#245f91' },
  { id: 'esposa', name: 'María', initials: 'MC', color: '#8a5d95' },
  { id: 'hija', name: 'Sofía', initials: 'SC', color: '#df765f' },
];

export const navigation = [
  { id: 'inicio', label: 'Inicio', symbol: 'I' },
  { id: 'expedientes', label: 'Expedientes', symbol: 'E' },
  { id: 'laboratorios', label: 'Laboratorios', symbol: 'L' },
  { id: 'medicamentos', label: 'Medicamentos', symbol: 'M', badge: '2' },
  { id: 'calendario', label: 'Calendario', symbol: 'C' },
  { id: 'documentos', label: 'Documentos', symbol: 'D' },
  { id: 'seguros', label: 'Seguros', symbol: 'S' },
] as const;

export type SectionId = (typeof navigation)[number]['id'];

export const metrics = [
  { value: '18', label: 'Citas médicas', detail: '15 completadas', tone: 'teal' },
  { value: '1', label: 'Hospitalización', detail: '3 días en total', tone: 'coral' },
  { value: '4', label: 'Tratamientos', detail: '2 activos', tone: 'blue' },
  { value: '6', label: 'Especialistas', detail: 'Durante 2026', tone: 'violet' },
];

export const appointments = [
  { day: '12', month: 'SEP', time: '9:30 a. m.', title: 'Control de hematología', person: 'Sofía', specialty: 'Hematología pediátrica', place: 'Hospital Pediátrico', tone: 'coral' },
  { day: '18', month: 'SEP', time: '3:00 p. m.', title: 'Consulta de reumatología', person: 'María', specialty: 'Reumatología', place: 'Clínica San Fernando', tone: 'violet' },
  { day: '25', month: 'SEP', time: '7:00 a. m.', title: 'Laboratorios de control', person: 'Joel', specialty: 'Medicina preventiva', place: 'Laboratorio central', tone: 'blue' },
];

export const monthlyVisits = [4, 7, 5, 9, 6, 11, 8, 13, 7, 10, 5, 8];

export const hemogramSeries = [
  { date: '14 jul', hb: 9.4, platelets: 244, leukocytes: 6.8 },
  { date: '28 jul', hb: 9.9, platelets: 261, leukocytes: 6.5 },
  { date: '12 ago', hb: 10.2, platelets: 273, leukocytes: 6.9 },
  { date: '27 ago', hb: 10.8, platelets: 284, leukocytes: 7.1 },
];

export const medications = [
  { name: 'Medicamento de demostración A', person: 'Sofía', schedule: 'Según indicación médica', status: 'Próxima dosis 8:00 p. m.', tone: 'coral' },
  { name: 'Medicamento de demostración B', person: 'María', schedule: 'Plan registrado en Healwave', status: 'Solo lectura', tone: 'violet' },
];

export const documents = [
  { name: 'Hemograma · 27 ago 2026', type: 'PDF comprimido', person: 'Sofía', size: '420 KB' },
  { name: 'Referencia a hematología', type: 'Imagen optimizada', person: 'Sofía', size: '680 KB' },
  { name: 'Póliza médica familiar', type: 'PDF original', person: 'Familia', size: '1.2 MB' },
];
