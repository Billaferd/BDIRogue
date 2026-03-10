import { Position } from "./types";

export class BayesianInference {
  priors: Record<string, number> = {};

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
