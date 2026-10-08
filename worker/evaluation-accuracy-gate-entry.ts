import chunkedEvaluationApp from './chunked-evaluation-entry';

// Optional philosophy persistence is owned by the chunked handler so its writes
// remain inside the same exam operation lock as the scored evaluation.
export default chunkedEvaluationApp;
