export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exercise_e1rm: {
        Row: {
          id: string
          athlete_id: string
          exercise_name: string
          e1rm_kg: number
          last_updated_date: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          athlete_id: string
          exercise_name: string
          e1rm_kg: number
          last_updated_date: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          athlete_id?: string
          exercise_name?: string
          e1rm_kg?: number
          last_updated_date?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          role: 'coach' | 'athlete'
          full_name: string
          email: string
          created_at: string
        }
        Insert: {
          id: string
          role: 'coach' | 'athlete'
          full_name: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          role?: 'coach' | 'athlete'
          full_name?: string
          email?: string
          created_at?: string
        }
        Relationships: []
      }
      coach_athlete: {
        Row: {
          coach_id: string
          athlete_id: string
          status: 'pending' | 'accepted' | 'rejected'
          accepted_at: string | null
          rejected_at: string | null
          created_at: string
        }
        Insert: {
          coach_id: string
          athlete_id: string
          status?: 'pending' | 'accepted' | 'rejected'
          accepted_at?: string | null
          rejected_at?: string | null
          created_at?: string
        }
        Update: {
          coach_id?: string
          athlete_id?: string
          status?: 'pending' | 'accepted' | 'rejected'
          accepted_at?: string | null
          rejected_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'coach_athlete_coach_id_fkey'
            columns: ['coach_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coach_athlete_athlete_id_fkey'
            columns: ['athlete_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      blocks: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          name: string
          type: 'Accumulation' | 'Intensification' | 'Réalisation' | 'Deload'
          start_date: string
          end_date: string | null
          total_weeks: number | null
          intensity_zone: string | null
          weeks_to_competition: number | null
          is_taper: boolean
          taper_volume_reduction_pct: number | null
          created_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id: string
          name: string
          type: 'Accumulation' | 'Intensification' | 'Réalisation' | 'Deload'
          start_date: string
          end_date?: string | null
          total_weeks?: number | null
          intensity_zone?: string | null
          weeks_to_competition?: number | null
          is_taper?: boolean
          taper_volume_reduction_pct?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          athlete_id?: string
          coach_id?: string
          name?: string
          type?: 'Accumulation' | 'Intensification' | 'Réalisation' | 'Deload'
          start_date?: string
          end_date?: string | null
          total_weeks?: number | null
          intensity_zone?: string | null
          weeks_to_competition?: number | null
          is_taper?: boolean
          taper_volume_reduction_pct?: number | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          block_id: string | null
          scheduled_date: string
          week_in_block: number | null
          session_number: number | null
          notes_coach: string | null
          notes_athlete: string | null
          bodyweight_kg: number | null
          duration_min: number | null
          session_feel: number | null
          status: 'prescribed' | 'in_progress' | 'completed'
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id: string
          block_id?: string | null
          scheduled_date: string
          week_in_block?: number | null
          session_number?: number | null
          notes_coach?: string | null
          notes_athlete?: string | null
          bodyweight_kg?: number | null
          duration_min?: number | null
          session_feel?: number | null
          status?: 'prescribed' | 'in_progress' | 'completed'
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          athlete_id?: string
          coach_id?: string
          block_id?: string | null
          scheduled_date?: string
          week_in_block?: number | null
          session_number?: number | null
          notes_coach?: string | null
          notes_athlete?: string | null
          bodyweight_kg?: number | null
          duration_min?: number | null
          session_feel?: number | null
          status?: 'prescribed' | 'in_progress' | 'completed'
          completed_at?: string | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          id: string
          session_id: string
          exercise_name: string
          exercise_format: string | null
          set_number: number
          weight_prescribed_kg: number | null
          reps_prescribed: number | null
          rpe_prescribed: number | null
          tempo: string | null
          rom_prescribed: string | null
          weight_actual_kg: number | null
          reps_actual: number | null
          rpe_actual: number | null
          rom_actual: string | null
          volume_load_kg: number | null
          e1rm_kg: number | null
          central_stress: number | null
          peripheral_stress: number | null
          total_stress: number | null
          rpe_realization_pct: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          exercise_name: string
          exercise_format?: string | null
          set_number: number
          weight_prescribed_kg?: number | null
          reps_prescribed?: number | null
          rpe_prescribed?: number | null
          tempo?: string | null
          rom_prescribed?: string | null
          weight_actual_kg?: number | null
          reps_actual?: number | null
          rpe_actual?: number | null
          rom_actual?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          exercise_name?: string
          exercise_format?: string | null
          set_number?: number
          weight_prescribed_kg?: number | null
          reps_prescribed?: number | null
          rpe_prescribed?: number | null
          tempo?: string | null
          rom_prescribed?: string | null
          weight_actual_kg?: number | null
          reps_actual?: number | null
          rpe_actual?: number | null
          rom_actual?: string | null
        }
        Relationships: []
      }
      daily_trackers: {
        Row: {
          id: string
          athlete_id: string
          date: string
          general_fatigue: number | null
          squat_fatigue: number | null
          bench_fatigue: number | null
          deadlift_fatigue: number | null
          motivation: number | null
          recovery: number | null
          sleep_duration_min: number | null
          sleep_quality: number | null
          bodyweight_kg: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          date: string
          general_fatigue?: number | null
          squat_fatigue?: number | null
          bench_fatigue?: number | null
          deadlift_fatigue?: number | null
          motivation?: number | null
          recovery?: number | null
          sleep_duration_min?: number | null
          sleep_quality?: number | null
          bodyweight_kg?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          athlete_id?: string
          date?: string
          general_fatigue?: number | null
          squat_fatigue?: number | null
          bench_fatigue?: number | null
          deadlift_fatigue?: number | null
          motivation?: number | null
          recovery?: number | null
          sleep_duration_min?: number | null
          sleep_quality?: number | null
          bodyweight_kg?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      competitions: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          competition_date: string
          name: string
          squat_attempt_1: number | null
          squat_attempt_2: number | null
          squat_attempt_3: number | null
          bench_attempt_1: number | null
          bench_attempt_2: number | null
          bench_attempt_3: number | null
          deadlift_attempt_1: number | null
          deadlift_attempt_2: number | null
          deadlift_attempt_3: number | null
          projected_total: number | null
          squat_result_1: boolean | null
          squat_result_2: boolean | null
          squat_result_3: boolean | null
          squat_best_kg: number | null
          bench_result_1: boolean | null
          bench_result_2: boolean | null
          bench_result_3: boolean | null
          bench_best_kg: number | null
          deadlift_result_1: boolean | null
          deadlift_result_2: boolean | null
          deadlift_result_3: boolean | null
          deadlift_best_kg: number | null
          total_kg: number | null
          ipf_gl_points: number | null
          post_comp_notes: string | null
          weakest_lift: string | null
          next_block_goals: string | null
          created_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id: string
          competition_date: string
          name: string
          squat_attempt_1?: number | null
          squat_attempt_2?: number | null
          squat_attempt_3?: number | null
          bench_attempt_1?: number | null
          bench_attempt_2?: number | null
          bench_attempt_3?: number | null
          deadlift_attempt_1?: number | null
          deadlift_attempt_2?: number | null
          deadlift_attempt_3?: number | null
          projected_total?: number | null
          squat_result_1?: boolean | null
          squat_result_2?: boolean | null
          squat_result_3?: boolean | null
          squat_best_kg?: number | null
          bench_result_1?: boolean | null
          bench_result_2?: boolean | null
          bench_result_3?: boolean | null
          bench_best_kg?: number | null
          deadlift_result_1?: boolean | null
          deadlift_result_2?: boolean | null
          deadlift_result_3?: boolean | null
          deadlift_best_kg?: number | null
          total_kg?: number | null
          ipf_gl_points?: number | null
          post_comp_notes?: string | null
          weakest_lift?: string | null
          next_block_goals?: string | null
          created_at?: string
        }
        Update: {
          competition_date?: string
          name?: string
          squat_attempt_1?: number | null
          squat_attempt_2?: number | null
          squat_attempt_3?: number | null
          bench_attempt_1?: number | null
          bench_attempt_2?: number | null
          bench_attempt_3?: number | null
          deadlift_attempt_1?: number | null
          deadlift_attempt_2?: number | null
          deadlift_attempt_3?: number | null
          projected_total?: number | null
          squat_result_1?: boolean | null
          squat_result_2?: boolean | null
          squat_result_3?: boolean | null
          squat_best_kg?: number | null
          bench_result_1?: boolean | null
          bench_result_2?: boolean | null
          bench_result_3?: boolean | null
          bench_best_kg?: number | null
          deadlift_result_1?: boolean | null
          deadlift_result_2?: boolean | null
          deadlift_result_3?: boolean | null
          deadlift_best_kg?: number | null
          total_kg?: number | null
          ipf_gl_points?: number | null
          post_comp_notes?: string | null
          weakest_lift?: string | null
          next_block_goals?: string | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          name: string
          category: 'Squat' | 'Hinge' | 'Horizontal Push' | 'Horizontal Pull' | 'Vertical Push' | 'Vertical Pull' | 'Accessoire' | 'Cardio'
          coach_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category: 'Squat' | 'Hinge' | 'Horizontal Push' | 'Horizontal Pull' | 'Vertical Push' | 'Vertical Pull' | 'Accessoire' | 'Cardio'
          coach_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: 'Squat' | 'Hinge' | 'Horizontal Push' | 'Horizontal Pull' | 'Vertical Push' | 'Vertical Pull' | 'Accessoire' | 'Cardio'
          coach_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lookup_e1rm: {
        Row: { rpe: number; reps: number; pct: number }
        Insert: { rpe: number; reps: number; pct: number }
        Update: { pct?: number }
        Relationships: []
      }
      lookup_central_stress: {
        Row: { rpe: number; reps: number; value: number }
        Insert: { rpe: number; reps: number; value: number }
        Update: { value?: number }
        Relationships: []
      }
      lookup_peripheral_stress: {
        Row: { rpe: number; reps: number; value: number }
        Insert: { rpe: number; reps: number; value: number }
        Update: { value?: number }
        Relationships: []
      }
      lookup_total_stress: {
        Row: { rpe: number; reps: number; value: number }
        Insert: { rpe: number; reps: number; value: number }
        Update: { value?: number }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_e1rm: {
        Args: { p_weight: number; p_rpe: number; p_reps: number }
        Returns: number
      }
      get_central_stress: {
        Args: { p_rpe: number; p_reps: number }
        Returns: number
      }
      get_peripheral_stress: {
        Args: { p_rpe: number; p_reps: number }
        Returns: number
      }
      get_total_stress: {
        Args: { p_rpe: number; p_reps: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Types dérivés pour usage dans l'app
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Block = Database['public']['Tables']['blocks']['Row']
export type Session = Database['public']['Tables']['sessions']['Row']
export type Set = Database['public']['Tables']['sets']['Row']
export type DailyTracker = Database['public']['Tables']['daily_trackers']['Row']
export type Competition = Database['public']['Tables']['competitions']['Row']
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type CoachAthlete = Database['public']['Tables']['coach_athlete']['Row']
