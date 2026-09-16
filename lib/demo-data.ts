export type ProfileId = string;

export const profiles = [
  { id: 'familia', name: 'Familia', initials: 'FC', color: '#0b6f69' },
  { id: 'joel', name: 'Diógenes Joel', initials: 'DG', color: '#245f91' },
  { id: 'esposa', name: 'Eileen Patricia', initials: 'EP', color: '#8a5d95' },
  { id: 'hija', name: 'Lia Joan', initials: 'LJ', color: '#df765f' },
];

export const navigation = [
  { id: 'inicio', label: 'Inicio', symbol: 'I' },
  { id: 'expedientes', label: 'Expedientes', symbol: 'E' },
  { id: 'laboratorios', label: 'Laboratorios', symbol: 'L' },
  { id: 'medicamentos', label: 'Medicamentos', symbol: 'M' },
  { id: 'calendario', label: 'Calendario', symbol: 'C' },
  { id: 'documentos', label: 'Documentos', symbol: 'D' },
  { id: 'seguros', label: 'Seguros', symbol: 'S' },
] as const;

export type SectionId = (typeof navigation)[number]['id'];
