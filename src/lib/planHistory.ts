import { PlanSection } from "../types/planning";
import { PlanHistoryPayload } from "../types/planHistory";

const serializePlanSection = (section: PlanSection) => {
  const { timestamp, ...rest } = section;
  return {
    ...rest,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
  };
};

export const buildPlanHistoryPayload = (section: PlanSection): PlanHistoryPayload => {
  const createdAt = section.timestamp instanceof Date
    ? section.timestamp.toISOString()
    : new Date(section.timestamp).toISOString();

  return {
    title: section.title,
    type: section.type,
    content: serializePlanSection(section),
    created_at: createdAt,
    executed_at: new Date().toISOString(),
    status: "executed",
  };
};
