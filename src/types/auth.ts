export type UserRole = 'admin' | 'viewer' | 'editor' | 'consultor';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  modules?: string[];
  password?: string;
  active?: boolean;
}

export type TabType = 'Resumen' | 'Analítica' | 'Mapas' | 'Configuración' | 'Auditoría' | 'Modelado' | 'Inteligencia';
