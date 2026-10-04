export interface CheckViolation {
  file: string;
  line: number;
  col: number;
  rule: string;
  message: string;
  fix: string;
}

export interface CheckResult {
  file: string;
  violations: CheckViolation[];
}
