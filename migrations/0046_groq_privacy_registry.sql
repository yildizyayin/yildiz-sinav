-- Groq is intentionally inactive until legal review, DPA and international transfer
-- evidence are completed. externalPersonalDataGate will block production calls.
INSERT OR IGNORE INTO processor_registry
  (id,service_code,provider_name,service_name,purpose,role_model,processing_region,data_categories_json,subject_categories_json,dpa_status,training_on_customer_data,active,legal_review_status)
VALUES
  ('proc_groq_ai','GROQ_AI','Groq','Groq OpenAI-compatible inference','Optional Nibiru reasoning fallback','PROCESSOR','US','["pseudonymized_academic_context"]','["student","parent","teacher","institution_staff"]','MISSING','UNKNOWN',0,'PENDING');
