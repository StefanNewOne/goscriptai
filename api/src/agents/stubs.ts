// Deterministic stub outputs so the whole flow runs end-to-end WITHOUT a live
// Claude Max/API session. Only agents/sdk.ts decides stub-vs-real; swapping in
// the real SDK does not touch any orchestration. Stubs are clearly-labelled
// scaffolding, not product copy.

export interface StubClientAnalystQuestions {
  questions: { id: string; text: string; kind: 'text' | 'choice'; options?: string[] }[];
}

export function stubAnalystQuestions(clientName: string): StubClientAnalystQuestions {
  return {
    questions: [
      { id: 'q1', text: `Кој е главниот продукт/понуда во фокус за ${clientName} овој месец?`, kind: 'text' },
      { id: 'q2', text: 'Кој е примарниот тон на комуникација?', kind: 'choice', options: ['Домашен и директен', 'Луксузен', 'Хумористичен', 'Стручен'] },
      { id: 'q3', text: 'Има ли активна промоција со датум од–до?', kind: 'text' },
    ],
  };
}

export function stubClientProfile(clientName: string, answers: Record<string, string>): { markdown: string; data: Record<string, unknown> } {
  const focus = answers.q1 ?? 'основната понуда';
  const tone = answers.q2 ?? 'домашен и директен';
  return {
    markdown: `# ${clientName}\n\nФокус овој период: ${focus}.\nТон: ${tone}.\n\n(Ова е автоматски нацрт на профил — потврди или врати со коментар.)`,
    data: { focus, tone, openQuestions: ['Потврди го буџетот за кампањата.'] },
  };
}

export interface StubAvatar {
  name: string;
  profile: Record<string, unknown>;
}

export function stubAvatars(clientName: string): StubAvatar[] {
  const base = (name: string, pain: string, desire: string, speech: string): StubAvatar => ({
    name,
    profile: { pain, desire, whyBuy: `Сака решение од ${clientName}.`, objections: ['Цена', 'Време'], speech },
  });
  return [
    base('Штедливиот', 'Плаќа премногу', 'Добра цена без компромис', 'Директно, бара бројки'),
    base('Зафтениот', 'Нема време', 'Брзо и лесно', 'Кратко, нетрпелив'),
    base('Внимателниот', 'Се плаши од грешка', 'Сигурност и гаранција', 'Прашува многу детали'),
    base('Статусниот', 'Сака да импресионира', 'Да изгледа добро', 'Емотивно, за изглед'),
  ];
}
