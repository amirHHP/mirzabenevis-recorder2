export interface Meeting {
  id: string;
  date: string;
  title: string;
  transcript: string;
  audioUri: string | null;
  highlights: Highlight[];
}

export interface Highlight {
  id: string;
  start: number;
  end: number;
  text: string;
}
