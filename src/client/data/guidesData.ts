export interface GuideCard {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  author: string;
  duration: string;
  gradient: string;
  promptSeed: string;
  initialQuestion: string;
  featured?: boolean;
}

export interface GuideCollection {
  id: string;
  name: string;
  icon: string;
}

export const GUIDE_COLLECTIONS: GuideCollection[] = [
  { id: "all", name: "All Guides", icon: "✨" },
  { id: "mind", name: "Mind & Thinking", icon: "🧠" },
  { id: "intentions", name: "Intention & Habits", icon: "🎯" },
  { id: "health", name: "Health & Wellness", icon: "🌿" },
  { id: "creativity", name: "Creativity", icon: "🎨" },
  { id: "spirituality", name: "Spirituality", icon: "🕯️" },
  { id: "relationships", name: "Relationships", icon: "🤝" },
  { id: "work", name: "Focus & Decisions", icon: "🧭" },
];

export const MOCK_GUIDES: GuideCard[] = [
  {
    id: "guide-shadow",
    title: "Embrace Your Shadow and Empower Your Life",
    subtitle: "Reflect on what you've hidden and where you want to grow into completeness.",
    category: "mind",
    author: "Carlotta Jung",
    duration: "10 mins",
    gradient: "from-amber-600/30 via-rose-500/20 to-indigo-600/30",
    featured: true,
    promptSeed:
      "Take a moment to examine a trait in others that strongly irritates you. What hidden part of your own needs or unexpressed boundaries does that reaction point towards?",
    initialQuestion: "What recent emotional reaction surprised you with its intensity?",
  },
  {
    id: "guide-frustration",
    title: "Solving Frustration: Think Prior",
    subtitle: "Trace modern friction back to its antecedent assumption before taking action.",
    category: "work",
    author: "David Kahneman",
    duration: "8 mins",
    gradient: "from-sky-600/30 via-indigo-500/20 to-blue-700/30",
    featured: true,
    promptSeed:
      "When tackling a stubborn roadblock, ask: What unspoken assumption am I holding about how this situation *should* behave? What changes if I discard that assumption?",
    initialQuestion: "What is currently demanding energy but yielding no forward progress?",
  },
  {
    id: "guide-winddown",
    title: "Evening Wind Down",
    subtitle: "A quiet decompression ritual to release cognitive load before restful sleep.",
    category: "health",
    author: "Elena Rostova",
    duration: "5 mins",
    gradient: "from-indigo-600/30 via-purple-500/20 to-slate-800/30",
    featured: true,
    promptSeed:
      "List three things completed today, one thing to let go of until tomorrow, and one gentle sensation of comfort right now.",
    initialQuestion: "What thought is trying to keep your mind active tonight?",
  },
  {
    id: "guide-happiness",
    title: "Dreaming Happiness",
    subtitle: "Envision ideal states of flow without the constraints of present logistics.",
    category: "creativity",
    author: "Maya Lin",
    duration: "12 mins",
    gradient: "from-teal-500/30 via-emerald-500/20 to-sky-600/30",
    featured: true,
    promptSeed:
      "If you had an entire uninterrupted month with zero obligations or deadlines, how would your mornings begin and what creative craft would you lose yourself in?",
    initialQuestion: "What is a creative curiosity you have been deferring?",
  },
  {
    id: "guide-emotions",
    title: "Processing Your Emotions",
    subtitle: "Map somatic feelings in the body into articulate cognitive awareness.",
    category: "mind",
    author: "Claire Geller",
    duration: "7 mins",
    gradient: "from-emerald-600/30 via-lime-500/20 to-teal-700/30",
    featured: false,
    promptSeed:
      "Where in your physical body is tension resting right now? Describe the texture, weight, and temperature of that sensation without immediately judging it.",
    initialQuestion: "What physical sensation are you noticing most prominently?",
  },
  {
    id: "guide-time",
    title: "Get Your Time Free",
    subtitle: "Audit energy leaks and reconstruct sovereign calendar boundaries.",
    category: "work",
    author: "Greg McKeown",
    duration: "15 mins",
    gradient: "from-blue-600/30 via-cyan-500/20 to-indigo-600/30",
    featured: false,
    promptSeed:
      "Identify the single highest-leverage activity that, if given 2 hours of deep focus every morning, would make everything else secondary or obsolete.",
    initialQuestion: "What is one commitment you can gracefully decline this week?",
  },
];
