import { createClient } from "@supabase/supabase-js";
import AppError from "./utils/appError";

const supabaseProjectUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseServiceClient = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceClient || !supabaseProjectUrl)
  throw new AppError(
    "Some error occurred while connecting database bucket",
    500
  );

const supabase = createClient(supabaseProjectUrl, supabaseServiceClient);

export default supabase;
