import { useState, useEffect } from "react";

export interface HistoryItem {
  id: string; // owner/repo
  owner: string;
  repo: string;
  timestamp: number;
}

const HISTORY_KEY = "gh_downloader_history";
const MAX_HISTORY = 5;

export function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const addToHistory = (owner: string, repo: string) => {
    setHistory((prev) => {
      const newItem: HistoryItem = {
        id: `${owner}/${repo}`,
        owner,
        repo,
        timestamp: Date.now(),
      };
      
      const filtered = prev.filter(item => item.id !== newItem.id);
      const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY);
      
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      } catch (e) {
        console.error("Failed to save history", e);
      }
      
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  return { history, addToHistory, clearHistory };
}
