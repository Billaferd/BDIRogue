import { Position, AgentConfiguration, DEFAULT_AGENT_CONFIG } from "./types";
import * as bayes from 'bayesjs';

const bayesAny = bayes as any;
const infer = bayesAny.infer || bayesAny.default?.infer;

export class BayesianInference {
  priors: Record<string, number> = {};
  globalPriors: Record<string, number>;
  consecutiveSuccesses: Record<string, number> = {};
  config: AgentConfiguration;
  
  observations: Record<string, Record<string, 'T' | 'F'>> = {};

  constructor(config: AgentConfiguration = DEFAULT_AGENT_CONFIG) {
    this.config = config;
    this.globalPriors = { mimic: config.bayesian.defaultMimicPrior };
  }

  private getMonsterNetwork() {
    const prior = this.globalPriors['monster_elite'] || 0.1;
    return {
      'ELITE': { id: 'ELITE', states: ['T', 'F'], parents: [], cpt: { 'T': prior, 'F': 1 - prior } },
      'PHYSICAL_PROFILE': { id: 'PHYSICAL_PROFILE', states: ['High', 'Low'], parents: ['ELITE'], cpt: [ { condition: { 'ELITE': 'T' }, probability: { 'High': 0.9, 'Low': 0.1 } }, { condition: { 'ELITE': 'F' }, probability: { 'High': 0.2, 'Low': 0.8 } } ] },
      'CONTEXT_PROFILE': { id: 'CONTEXT_PROFILE', states: ['High', 'Low'], parents: ['ELITE'], cpt: [ { condition: { 'ELITE': 'T' }, probability: { 'High': 0.8, 'Low': 0.2 } }, { condition: { 'ELITE': 'F' }, probability: { 'High': 0.3, 'Low': 0.7 } } ] },
      'large': { id: 'large', states: ['T', 'F'], parents: ['PHYSICAL_PROFILE'], cpt: [ { condition: { 'PHYSICAL_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'PHYSICAL_PROFILE': 'Low' }, probability: { 'T': 0.2, 'F': 0.8 } } ] },
      'fast': { id: 'fast', states: ['T', 'F'], parents: ['PHYSICAL_PROFILE'], cpt: [ { condition: { 'PHYSICAL_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'PHYSICAL_PROFILE': 'Low' }, probability: { 'T': 0.2, 'F': 0.8 } } ] },
      'auditory_cadence_heavy': { id: 'auditory_cadence_heavy', states: ['T', 'F'], parents: ['PHYSICAL_PROFILE'], cpt: [ { condition: { 'PHYSICAL_PROFILE': 'High' }, probability: { 'T': 0.8, 'F': 0.2 } }, { condition: { 'PHYSICAL_PROFILE': 'Low' }, probability: { 'T': 0.1, 'F': 0.9 } } ] },
      'auditory_cadence_light': { id: 'auditory_cadence_light', states: ['T', 'F'], parents: ['PHYSICAL_PROFILE'], cpt: [ { condition: { 'PHYSICAL_PROFILE': 'High' }, probability: { 'T': 0.2, 'F': 0.8 } }, { condition: { 'PHYSICAL_PROFILE': 'Low' }, probability: { 'T': 0.8, 'F': 0.2 } } ] },
      'breathing': { id: 'breathing', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.3, 'F': 0.7 } } ] },
      'suspicious': { id: 'suspicious', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.3, 'F': 0.7 } } ] },
      'near_dead_end': { id: 'near_dead_end', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.7, 'F': 0.3 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.4, 'F': 0.6 } } ] },
      'near_blood_splatter': { id: 'near_blood_splatter', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.7, 'F': 0.3 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.4, 'F': 0.6 } } ] }
    };
  }

  private getItemNetwork() {
    const prior = this.globalPriors['item_beneficial'] || 0.1;
    return {
      'BENEFICIAL': { id: 'BENEFICIAL', states: ['T', 'F'], parents: [], cpt: { 'T': prior, 'F': 1 - prior } },
      'ITEM_PROFILE': { id: 'ITEM_PROFILE', states: ['High', 'Low'], parents: ['BENEFICIAL'], cpt: [ { condition: { 'BENEFICIAL': 'T' }, probability: { 'High': 0.9, 'Low': 0.1 } }, { condition: { 'BENEFICIAL': 'F' }, probability: { 'High': 0.2, 'Low': 0.8 } } ] },
      'blue': { id: 'blue', states: ['T', 'F'], parents: ['ITEM_PROFILE'], cpt: [ { condition: { 'ITEM_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'ITEM_PROFILE': 'Low' }, probability: { 'T': 0.3, 'F': 0.7 } } ] },
      'high_viscosity': { id: 'high_viscosity', states: ['T', 'F'], parents: ['ITEM_PROFILE'], cpt: [ { condition: { 'ITEM_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'ITEM_PROFILE': 'Low' }, probability: { 'T': 0.3, 'F': 0.7 } } ] },
      'amulet': { id: 'amulet', states: ['T', 'F'], parents: ['BENEFICIAL'], cpt: [ { condition: { 'BENEFICIAL': 'T' }, probability: { 'T': 0.99, 'F': 0.01 } }, { condition: { 'BENEFICIAL': 'F' }, probability: { 'T': 0.01, 'F': 0.99 } } ] },
      'near_dead_end': { id: 'near_dead_end', states: ['T', 'F'], parents: ['ITEM_PROFILE'], cpt: [ { condition: { 'ITEM_PROFILE': 'High' }, probability: { 'T': 0.2, 'F': 0.8 } }, { condition: { 'ITEM_PROFILE': 'Low' }, probability: { 'T': 0.6, 'F': 0.4 } } ] },
      'near_blood_splatter': { id: 'near_blood_splatter', states: ['T', 'F'], parents: ['ITEM_PROFILE'], cpt: [ { condition: { 'ITEM_PROFILE': 'High' }, probability: { 'T': 0.2, 'F': 0.8 } }, { condition: { 'ITEM_PROFILE': 'Low' }, probability: { 'T': 0.6, 'F': 0.4 } } ] }
    };
  }

  private getMimicNetwork() {
    const prior = this.globalPriors['mimic'] || this.config.bayesian.defaultMimicPrior;
    return {
      'MIMIC': { id: 'MIMIC', states: ['T', 'F'], parents: [], cpt: { 'T': prior, 'F': 1 - prior } },
      'CONTEXT_PROFILE': { id: 'CONTEXT_PROFILE', states: ['High', 'Low'], parents: ['MIMIC'], cpt: [ { condition: { 'MIMIC': 'T' }, probability: { 'High': 0.9, 'Low': 0.1 } }, { condition: { 'MIMIC': 'F' }, probability: { 'High': 0.2, 'Low': 0.8 } } ] },
      'breathing': { id: 'breathing', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.1, 'F': 0.9 } } ] },
      'suspicious': { id: 'suspicious', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.2, 'F': 0.8 } } ] },
      'near_dead_end': { id: 'near_dead_end', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.8, 'F': 0.2 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.4, 'F': 0.6 } } ] },
      'near_blood_splatter': { id: 'near_blood_splatter', states: ['T', 'F'], parents: ['CONTEXT_PROFILE'], cpt: [ { condition: { 'CONTEXT_PROFILE': 'High' }, probability: { 'T': 0.9, 'F': 0.1 } }, { condition: { 'CONTEXT_PROFILE': 'Low' }, probability: { 'T': 0.3, 'F': 0.7 } } ] }
    };
  }

  updateGlobalPrior(hypothesisId: string, isTrue: boolean) {
    let prior = this.globalPriors[hypothesisId] || 0.1;
    if (isTrue) {
      this.consecutiveSuccesses[hypothesisId] = (this.consecutiveSuccesses[hypothesisId] || 0) + 1;
      prior = Math.min(0.9, prior + 0.1);
      if (this.consecutiveSuccesses[hypothesisId] >= 3) prior = Math.min(0.9, prior + 0.2);
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

  updateBelief(entityId: string, evidence: Record<string, boolean>, likelihoodsIgnored: Record<string, number>, coordinates?: Position) {
    if (!this.observations[entityId]) this.observations[entityId] = {};
    for (const [trait, value] of Object.entries(evidence)) {
      this.observations[entityId][trait] = value ? 'T' : 'F';
    }

    let network: any;
    let targetNode: string;
    
    if (entityId.startsWith('monster')) {
      network = this.getMonsterNetwork();
      targetNode = 'ELITE';
    } else if (entityId.startsWith('chest')) {
      network = this.getMimicNetwork();
      targetNode = 'MIMIC';
    } else {
      network = this.getItemNetwork();
      targetNode = 'BENEFICIAL';
    }

    const validEvidence: Record<string, string> = {};
    for (const [trait, value] of Object.entries(this.observations[entityId])) {
      if (network[trait]) validEvidence[trait] = value;
    }

    try {
      const prob = infer(network, { [targetNode]: 'T' }, validEvidence);
      this.priors[entityId] = prob;
    } catch (e) {
      console.error(`Bayesian inference failed for ${entityId}`, e);
    }
  }
}
