import { Injectable } from '@nestjs/common';
import type { AgentLlmCompleteInput, AgentLlmDecision, AgentLlmProvider, AgentReplyLanguage } from './agent-llm.types';

const ARABIC = /[\u0600-\u06FF]/;
const PRODUCT = /منتج|product/i;
const ADD = /أضيف|اضيف|أضف|add|جديد/i;
const INSPECT = /افحص|فحص|inspect|diagnose|مشكلة/i;
const ORDERS = /طلب|orders?|checkout/i;
const DEVELOP = /طور|تطوير|develop|improve|نظام المنتجات|product system/i;
const SENSITIVE = /deploy|apply_patch|migrate|migration|stripe|sendgrid|سر|secret|إنتاج|production|حذف مستأجر|delete tenant/i;

export function detectReplyLanguage(text: string): AgentReplyLanguage {
  const hasAr = ARABIC.test(text);
  const hasLat = /[A-Za-z]/.test(text);
  if (hasAr && hasLat) {
    return 'mixed';
  }
  return hasAr ? 'ar' : 'en';
}

/**
 * Deterministic bilingual planner used when Ollama is unavailable and in tests.
 * It never invents files, APIs, or tenant data; it only classifies intent.
 */
@Injectable()
export class HeuristicLlmProvider implements AgentLlmProvider {
  readonly name = 'heuristic';

  async complete(input: AgentLlmCompleteInput): Promise<AgentLlmDecision> {
    const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
    const text = lastUser?.content ?? '';
    const language = detectReplyLanguage(text);
    const stateKnown = input.projectStateExcerpt.includes('# PROJECT STATE');

    if (PRODUCT.test(text) && ADD.test(text)) {
      return {
        language,
        intent: 'clarify',
        propose: false,
        safeTools: [],
        questions: language === 'en'
          ? ['Which restaurant/tenant?', 'Product name?', 'Category?', 'Price and currency?']
          : ['أي مطعم / مستأجر؟', 'ما اسم المنتج؟', 'ما التصنيف؟', 'ما السعر والعملة؟'],
        reply: language === 'en'
          ? 'I will not invent a product. Tell me the restaurant, product name, category, and price before any plan.'
          : 'لن أخمن منتجاً. حدّد المطعم واسم المنتج والتصنيف والسعر قبل أي خطة.',
      };
    }

    if (INSPECT.test(text) && ORDERS.test(text)) {
      return {
        language,
        intent: 'inspect',
        propose: false,
        safeTools: [{ tool: 'read_project_state', args: {} }, { tool: 'git_status', args: {} }],
        questions: [],
        reply: language === 'en'
          ? 'I will inspect PROJECT_STATE.md and git status only. Agent V1 cannot read restaurant, order, or customer tables.'
          : 'سأفحص PROJECT_STATE.md وحالة git فقط. وكيل V1 لا يقرأ جداول المطاعم أو الطلبات أو العملاء.',
      };
    }

    if (DEVELOP.test(text)) {
      return {
        language,
        intent: 'plan',
        propose: true,
        safeTools: [{ tool: 'read_project_state', args: {} }],
        questions: language === 'en'
          ? ['What outcome do you want for the product system?']
          : ['ما النتيجة المطلوبة لنظام المنتجات؟'],
        reply: language === 'en'
          ? 'I will not change code. After reading PROJECT_STATE I will propose a plan for approval only.'
          : 'لن أعدّل الكود. بعد قراءة PROJECT_STATE سأقترح خطة للموافقة فقط.',
        plan: {
          summary: 'Inspect existing catalog architecture and propose a product-system change without executing it.',
          steps: [
            'Read PROJECT_STATE.md as source of truth.',
            'Identify existing menu/product APIs already shipped.',
            'Ask the owner for the desired outcome.',
            'Record propose_plan for PLATFORM_OWNER approval. Do not apply patches.',
          ],
          risks: ['Inventing new product APIs would contradict shipped AUDIT-006/007/014 work.'],
          affectedAreas: ['apps/api/src/menu', 'apps/backoffice products module'],
          missingInformation: ['Desired outcome / acceptance criteria'],
        },
      };
    }

    if (SENSITIVE.test(text)) {
      return {
        language,
        intent: 'plan',
        propose: true,
        safeTools: stateKnown ? [] : [{ tool: 'read_project_state', args: {} }],
        questions: [],
        reply: language === 'en'
          ? 'That is a sensitive request. I will record a proposal only. Slice 3 cannot execute it.'
          : 'هذا طلب حسّاس. سأسجّل اقتراحاً فقط. الشريحة 3 لا تنفّذه.',
        plan: {
          summary: 'Sensitive request recorded without execution.',
          steps: ['Do not execute.', 'Await PLATFORM_OWNER approval.', 'Remain disabled in Slice 3.'],
          risks: ['Unauthorized production or secret change.'],
          affectedAreas: ['not executed'],
          missingInformation: [],
        },
      };
    }

    return {
      language,
      intent: 'inspect',
      propose: false,
      safeTools: [{ tool: 'read_project_state', args: {} }],
      questions: language === 'en'
        ? ['What should I inspect or plan next?']
        : ['ماذا تريد أن أفحص أو أخطط؟'],
      reply: language === 'en'
        ? 'I will read PROJECT_STATE.md first and will not invent scope.'
        : 'سأقرأ PROJECT_STATE.md أولاً ولن أخترع نطاقاً.',
    };
  }
}
