import {createPrivateRubricExportEntry} from './private-rubric-export-entry';
import app from './optical-print-policy-staging-entry';
import { createPreviewPolicyEntry } from './preview-policy-entry';

export default createPrivateRubricExportEntry(createPreviewPolicyEntry(app));
