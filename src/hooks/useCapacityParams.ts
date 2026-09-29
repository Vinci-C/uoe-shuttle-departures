import { useEffect, useState } from "react";

export interface CapacityParams {
  dayOfWeek: number;
  semesterWeek: number;
  temperature: number;
  rainfall: number;
}

// Semester 2 2026 starts 12 January 2026.
const SEMESTER_START = new Date("2026-01-12T00:00:00Z");

/**
 * Flexible Learning Week (calendar week 6) and Spring Break (weeks 13-14) are skipped,
 * which is what the model expects when it is fed `weekOfSemester`.
 */
export function calculateSemesterWeek(date: Date): number {
  const diffDays = Math.floor((date.getTime() - SEMESTER_START.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;

  const calendarWeek = Math.floor(diffDays / 7) + 1;

  if (calendarWeek === 6) return -1;
  if (calendarWeek > 6 && calendarWeek < 13) return calendarWeek - 1;
  if (calendarWeek === 13 || calendarWeek === 14) return -1;
  if (calendarWeek > 14) return calendarWeek - 3;
  return calendarWeek;
}

const toRainfallScale = (rainMm: number): number => {
  if (rainMm === 0) return 0;
  if (rainMm < 0.5) return 1;
  if (rainMm < 4) return 2;
  return 3;
};

/** Weather and semester week: the two inputs the passenger model needs beyond bus time. */
export function useCapacityParams(now: Date): CapacityParams {
  const [temperature, setTemperature] = useState(10);
  const [rainfall, setRainfall] = useState(0);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=55.9533&longitude=-3.1883&current=temperature_2m,rain&timezone=GMT",
        );
        const data = await response.json();
        if (data.current) {
          setTemperature(Math.round(data.current.temperature_2m));
          setRainfall(toRainfallScale(data.current.rain));
        }
      } catch (err) {
        console.warn("Weather fetch failed, using defaults", err);
      }
    };

    void fetchWeather();
    const interval = setInterval(fetchWeather, 600_000);
    return () => clearInterval(interval);
  }, []);

  return {
    dayOfWeek: now.getDay(),
    semesterWeek: calculateSemesterWeek(now),
    temperature,
    rainfall,
  };
}
