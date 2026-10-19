import spec from '../../data/question-pilot-math11-curriculum.json';
export function math11PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==11||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.11.1.1':'Study paired observations for two quantitative variables through a research question, data collection/preparation, suitable visualization or summaries and contextual interpretation. Distinguish association from causation. Correlation is not a causal proof; constant variables can make a coefficient undefined. Use anonymized data and explicit units/sampling conditions.',
  'MAT.11.1.2':'Critically assess statistical conclusions from paired quantitative data. Identify sampling/selection bias, misleading scales, outliers, unsupported extrapolation and causal claims without justification. Keep reported observations distinct from modeled or assumed data.',
 };
 return 'MEB '+context.outcomeCode+'; current first-theme source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' Guidance only: scatter-plot rendering, statistical proof and fresh question-production quality still require separate qualification.';
}
