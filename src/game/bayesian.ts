export class BayesianInference {
  priorMimic = 0.1;

  update(isBreathing: boolean, isSuspicious: boolean): number {
    let pMimic = this.priorMimic;

    // Update for breathing
    const pBreathingGivenMimic = 0.8;
    const pBreathingGivenNotMimic = 0.05;

    if (isBreathing) {
      pMimic =
        (pBreathingGivenMimic * pMimic) /
        (pBreathingGivenMimic * pMimic +
          pBreathingGivenNotMimic * (1 - pMimic));
    } else {
      const pNotBreathingGivenMimic = 1 - pBreathingGivenMimic;
      const pNotBreathingGivenNotMimic = 1 - pBreathingGivenNotMimic;
      pMimic =
        (pNotBreathingGivenMimic * pMimic) /
        (pNotBreathingGivenMimic * pMimic +
          pNotBreathingGivenNotMimic * (1 - pMimic));
    }

    // Update for suspicious
    const pSuspiciousGivenMimic = 0.7;
    const pSuspiciousGivenNotMimic = 0.2;

    if (isSuspicious) {
      pMimic =
        (pSuspiciousGivenMimic * pMimic) /
        (pSuspiciousGivenMimic * pMimic +
          pSuspiciousGivenNotMimic * (1 - pMimic));
    } else {
      const pNotSuspiciousGivenMimic = 1 - pSuspiciousGivenMimic;
      const pNotSuspiciousGivenNotMimic = 1 - pSuspiciousGivenNotMimic;
      pMimic =
        (pNotSuspiciousGivenMimic * pMimic) /
        (pNotSuspiciousGivenMimic * pMimic +
          pNotSuspiciousGivenNotMimic * (1 - pMimic));
    }

    return pMimic;
  }
}
