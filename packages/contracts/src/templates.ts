import { z } from 'zod';
import { AspectRatio, Id } from './primitives';
import { ProjectFormat } from './project';
import { AVATAR_STYLE_DEFAULT, AvatarStyle } from './studio';
import { TEXT_STYLE_DEFAULT, TextStyle } from './timeline';

/**
 * Шаблоны роликов и стили оформления (п.13 ТЗ).
 *
 * Живут в контрактах, а не в интерфейсе, по той же причине, что и права
 * доступа: это данные. Экран лишь показывает готовый список, а сервер, когда
 * появится, будет отдавать его же — вместе с шаблонами, которые заведут
 * администраторы.
 *
 * Шаблон не содержит текста реплик. Он задаёт кадр, оформление и *скелет*
 * сценария: названия сцен и указания к съёмке. Придумывать за пользователя,
 * что он хочет сказать, — не дело платформы, а вот подсказать, из каких частей
 * обычно состоит такой ролик, полезно.
 */

export const DesignStyle = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  /** Кадр аватара: фон, форма, скругление, приближение. */
  avatar: AvatarStyle,
  /** Оформление надписей и субтитров. */
  text: TextStyle,
});
export type DesignStyle = z.infer<typeof DesignStyle>;

export const TemplateScene = z.object({
  title: z.string().min(1),
  /** Указания к кадру: поза, жесты, план. Речь задаёт сам пользователь. */
  prompt: z.string(),
  /** Подсказка в пустом поле реплики — что здесь обычно говорят. */
  placeholder: z.string(),
});
export type TemplateScene = z.infer<typeof TemplateScene>;

export const ProjectTemplate = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  aspectRatio: AspectRatio,
  format: ProjectFormat,
  styleId: Id,
  scenes: z.array(TemplateScene),
});
export type ProjectTemplate = z.infer<typeof ProjectTemplate>;

const CLEAN: DesignStyle = DesignStyle.parse({
  id: 'sty_clean',
  name: 'Чистый',
  description: 'Кадр как на фото, белые подписи с тенью',
  avatar: AVATAR_STYLE_DEFAULT,
  text: TEXT_STYLE_DEFAULT,
});

export const DESIGN_STYLES: DesignStyle[] = [
  CLEAN,
  DesignStyle.parse({
    id: 'sty_studio',
    name: 'Студия',
    description: 'Тёмный однотонный фон, крупные светлые подписи',
    avatar: {
      ...AVATAR_STYLE_DEFAULT,
      background: { kind: 'color', color: '#111827', assetId: null },
    },
    text: { ...TEXT_STYLE_DEFAULT, fontSizeRatio: 0.075, fontWeight: 700 },
  }),
  DesignStyle.parse({
    id: 'sty_circle',
    name: 'Кружок',
    description: 'Аватар в круге поверх фона — для соцсетей',
    avatar: {
      ...AVATAR_STYLE_DEFAULT,
      shape: 'circle',
      cornerRadiusPx: 400,
      zoomPct: 130,
    },
    text: { ...TEXT_STYLE_DEFAULT, fontSizeRatio: 0.08, backgroundColor: '#000000' },
  }),
  DesignStyle.parse({
    id: 'sty_lecture',
    name: 'Лекция',
    description: 'Кадр со скруглением, спокойные подписи снизу',
    avatar: {
      ...AVATAR_STYLE_DEFAULT,
      shape: 'circle',
      cornerRadiusPx: 48,
      zoomPct: 110,
    },
    text: { ...TEXT_STYLE_DEFAULT, fontSizeRatio: 0.05, backgroundColor: '#172033' },
  }),
];

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  ProjectTemplate.parse({
    id: 'tpl_blank',
    name: 'Пустой проект',
    description: 'Одна сцена и ничего лишнего',
    aspectRatio: '16:9',
    format: 'standard',
    styleId: 'sty_clean',
    scenes: [],
  }),
  ProjectTemplate.parse({
    id: 'tpl_intro',
    name: 'Приветственный ролик',
    description: 'Знакомство с компанией или продуктом за минуту',
    aspectRatio: '16:9',
    format: 'standard',
    styleId: 'sty_studio',
    scenes: [
      {
        title: 'Приветствие',
        prompt: 'Открытая поза, лёгкая улыбка, взгляд в камеру',
        placeholder: 'Здравствуйте! Меня зовут… и сегодня я расскажу о…',
      },
      {
        title: 'В чём суть',
        prompt: 'Спокойные жесты руками, средний план',
        placeholder: 'Коротко о том, чем вы занимаетесь и кому это нужно.',
      },
      {
        title: 'Что делать дальше',
        prompt: 'Прямой взгляд в камеру, уверенная интонация',
        placeholder: 'Призыв к действию: перейти, написать, попробовать.',
      },
    ],
  }),
  ProjectTemplate.parse({
    id: 'tpl_lesson',
    name: 'Учебный урок',
    description: 'Разбор темы по шагам с выводом в конце',
    aspectRatio: '16:9',
    format: 'standard',
    styleId: 'sty_lecture',
    scenes: [
      {
        title: 'О чём урок',
        prompt: 'Спокойная поза, взгляд в камеру',
        placeholder: 'Что разберём и зачем это нужно.',
      },
      {
        title: 'Шаг первый',
        prompt: 'Жест перечисления, средний план',
        placeholder: 'Первая часть темы.',
      },
      {
        title: 'Шаг второй',
        prompt: 'Жест перечисления, средний план',
        placeholder: 'Вторая часть темы.',
      },
      {
        title: 'Итог',
        prompt: 'Пауза перед выводом, спокойная интонация',
        placeholder: 'Главное, что стоит запомнить.',
      },
    ],
  }),
  ProjectTemplate.parse({
    id: 'tpl_shorts',
    name: 'Вертикальный ролик',
    description: 'Короткое видео для Shorts, Reels и TikTok',
    aspectRatio: '9:16',
    format: 'standard',
    styleId: 'sty_circle',
    scenes: [
      {
        title: 'Зацепка',
        prompt: 'Крупный план, живая мимика, быстрый темп',
        placeholder: 'Первая фраза, ради которой досмотрят до конца.',
      },
      {
        title: 'Суть',
        prompt: 'Крупный план, активные жесты',
        placeholder: 'Одна мысль — без отступлений.',
      },
      {
        title: 'Призыв',
        prompt: 'Взгляд в камеру, короткая пауза в конце',
        placeholder: 'Подписывайтесь, переходите, пробуйте.',
      },
    ],
  }),
  ProjectTemplate.parse({
    id: 'tpl_podcast',
    name: 'Видеоподкаст',
    description: 'Разговор двух аватаров по ролям',
    aspectRatio: '16:9',
    format: 'podcast',
    styleId: 'sty_studio',
    scenes: [],
  }),
];

export function findTemplate(id: string): ProjectTemplate | null {
  return PROJECT_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function findStyle(id: string): DesignStyle {
  return DESIGN_STYLES.find((style) => style.id === id) ?? CLEAN;
}
