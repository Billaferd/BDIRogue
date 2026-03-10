import { Position } from "./types";

export class BayesianInference {
  priors: Record<string, number> = {};
  globalPriors: Record<string, number> = { mimic: 0.1 };
  consecutiveSuccesses: Record<string, number> = {};

  updateGlobalPrior(hypothesisId: string, isTrue: boolean) {
    let prior = this.globalPriors[hypothesisId] || 0.1;
    
    if (isTrue) {
      this.consecutiveSuccesses[hypothesisId] = (this.consecutiveSuccesses[hypothesisId] || 0) + 1;
      prior = Math.min(0.9, prior + 0.1);
      if (this.consecutiveSuccesses[hypothesisId] >= 3) {
        prior = Math.min(0.9, prior + 0.2);
      }
    } else {
      this.consecutiveSuccesses[hypothesisId] = 0;
      prior = Math.max(0.1, prior - 0.05);
    }
    this.globalPriors[hypothesisId] = prior;
  }

  updatePrior(hypothesisId: string, isTrue: boolean) {
    const prior = this.priors[hypothesisId] || 0.1;
    this.priors[hypothesisId] = (prior * 0.9) + (isTrue ? 0.1 : 0);
  }

  updateBelief(hypothesisId: string, evidence: Record<string, boolean>, likelihoods: Record<string, number>, coordinates?: Position) {
    let pH = this.priors[hypothesisId] || 0.1;

    for (const [signal, value] of Object.entries(evidence)) {
      const pEGivenH = value ? likelihoods[`${signal}_true`] : (1 - likelihoods[`${signal}_true`]);
      const pEGivenNotH = value ? likelihoods[`${signal}_false`] : (1 - likelihoods[`${signal}_false`]);
      if (pEGivenH === undefined || pEGivenNotH === undefined) continue;

      pH = (pEGivenH * pH) / (pEGivenH * pH + pEGivenNotH * (1 - pH));
    }
    this.priors[hypothesisId] = pH;
  }
}
