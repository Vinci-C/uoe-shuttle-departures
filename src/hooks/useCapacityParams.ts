import { useEffect, useState } from "react";
import { getTeachingWeek } from "../data/timetable";
import { londonDayOfWeek } from "../lib/londonTime";

export interface CapacityParams {
  dayOfWeek: number;
  semesterWeek: number;
  temperature: number;
  rainfall: number;
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
    // London, not the visitor's local clock. The timetable, the service ids and the
    // attribution window are all day-scoped in London, so a day-of-week feature
    // derived from anywhere else disagrees with them near midnight.
    dayOfWeek: londonDayOfWeek(now),
    // Read from ACADEMIC_CALENDAR_2026_27. This used to be computed from a single
    // hardcoded semester start, which expired and silently drove the week number far
    // outside the range the model was trained on. See that table for the full story.
    semesterWeek: getTeachingWeek(now),
    temperature,
    rainfall,
  };
}
