import type {
  AuthEvent,
  AuthFlow,
  Checkpoint,
  OutboxMessage,
  Result,
  Session,
  SignUpInput,
  User,
} from "../../types/backend";
export interface AuthClient {
  signUp(
    input: SignUpInput,
  ): Promise<
    Result<{ user: User | null; session: Session | null; flow_id: string }>
  >;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<
    Result<{ user: User; session: Session | null; flow_id?: string }>
  >;
  // Leaves the page for Google; the result only reports a failure to start.
  signInWithGoogle(returnTo?: string | null): Promise<Result<null>>;
  signOut(options?: { scope: "local" | "global" }): Promise<Result<null>>;
  getSession(): Promise<Result<{ session: Session | null }>>;
  getUser(): Promise<Result<{ user: User | null }>>;
  onAuthStateChange(
    callback: (event: AuthEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } }; error: null };
  resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<Result<{ flow_id: string }>>;
  updateUser(
    input: { data?: { name: string }; email?: string; password?: string },
    options?: { currentPassword?: string; token?: string },
  ): Promise<Result<{ user: User; flow_id?: string }>>;
  verifyEmail(input: {
    token: string;
    type: "verify" | "email_change" | "recovery";
  }): Promise<Result<{ user: User | null; session: Session | null }>>;
  deleteUser(input: {
    confirmation: string;
    currentPassword: string;
  }): Promise<Result<null>>;
  resend(input: {
    type: "signup" | "email_change";
    email: string;
    options?: { emailRedirectTo?: string };
  }): Promise<Result<{ flow_id: string }>>;
  getFlow(id: string): Promise<Result<AuthFlow | null>>;
  getOutbox(): Promise<Result<OutboxMessage[]>>;
  initialize(): Promise<Result<null>>;
  // Owner-bound checkpoints can be flushed after expiry; they never grant case access.
  retainDraft(
    checkpoint: Checkpoint,
    expiredToken: string,
  ): Promise<Result<null>>;
}
