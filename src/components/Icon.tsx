import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  Plus,
  PlusCircle,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Camera,
  MessageCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  XCircle,
  CloudDownload,
  Palette,
  Wrench,
  Pencil,
  FileText,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  Home,
  Info,
  List,
  MapPin,
  LogOut,
  Mail,
  Bell,
  Users,
  User,
  UserPlus,
  CircleUser,
  Play,
  RefreshCw,
  Search,
  Settings,
  Star,
  BarChart2,
  CircleDot,
  Clock,
  Trash2,
  Trophy,
  TrendingUp,
  Save,
  Navigation,
  Map,
  Crosshair,
  Heart,
  Shuffle,
  Repeat,
  Phone,
  Check,
  BookUser,
  Send,
  Activity,
  type LucideIcon,
} from 'lucide-react-native';

const ICON_MAP = {
  'plus': Plus,
  'plus-circle': PlusCircle,
  'bar-chart': BarChart3,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'calendar': Calendar,
  'camera': Camera,
  'message-circle': MessageCircle,
  'check-circle': CheckCircle,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'x': X,
  'x-circle': XCircle,
  'cloud-download': CloudDownload,
  'palette': Palette,
  'wrench': Wrench,
  'pencil': Pencil,
  'file-text': FileText,
  'eye': Eye,
  'eye-off': EyeOff,
  'flame': Flame,
  'help-circle': HelpCircle,
  'home': Home,
  'info': Info,
  'list': List,
  'map-pin': MapPin,
  'log-out': LogOut,
  'mail': Mail,
  'bell': Bell,
  'users': Users,
  'user': User,
  'user-plus': UserPlus,
  'circle-user': CircleUser,
  'play': Play,
  'refresh-cw': RefreshCw,
  'search': Search,
  'settings': Settings,
  'star': Star,
  'bar-chart-2': BarChart2,
  'circle-dot': CircleDot,
  'clock': Clock,
  'trash': Trash2,
  'trophy': Trophy,
  'trending-up': TrendingUp,
  'save': Save,
  'navigation': Navigation,
  'map': Map,
  'crosshair': Crosshair,
  'heart': Heart,
  'shuffle': Shuffle,
  'repeat': Repeat,
  'phone': Phone,
  'check': Check,
  'book-user': BookUser,
  'send': Send,
  'activity': Activity,
} as const;

export type IconName = keyof typeof ICON_MAP;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export const Icon = ({ name, size = 24, color = '#333333', style }: IconProps) => {
  const LucideComponent: LucideIcon = ICON_MAP[name];

  return (
    <LucideComponent
      size={size}
      color={color}
      strokeWidth={3}
      strokeLinecap="round"
      style={style}
    />
  );
};
