'use client'

import { useEffect } from 'react'

const replacements: Array<[RegExp, string]> = [
  [/^Cobrar$/i, 'Finalizar atendimento'],
  [/^Delete appointment$/i, 'Excluir agendamento'],
  [/^Delete this appointment\?$/i, 'Excluir este agendamento?'],
  [/^Delete$/i, 'Excluir'],
  [/^Cancel$/i, 'Cancelar'],
  [/^Unassigned$/i, 'Sem profissional'],
  [/^Online booking$/i, 'Agendamento online'],
]

function replaceTextNodes(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const original = node.textContent ?? ''
    const trimmed = original.trim()

    for (const [pattern, replacement] of replacements) {
      if (pattern.test(trimmed)) {
        node.textContent = original.replace(trimmed, replacement)
        break
      }
    }

    node = walker.nextNode()
  }
}

function enhanceAppointmentModal() {
  const buttons = Array.from(document.querySelectorAll('button'))

  for (const button of buttons) {
    replaceTextNodes(button)

    const label = button.textContent?.trim() ?? ''
    if (/^(Pago|Concluído)$/i.test(label)) {
      button.style.display = 'none'
    }

    if (/^Finalizar atendimento$/i.test(label)) {
      button.setAttribute('title', 'Registre a forma de pagamento e conclua o atendimento em uma única etapa.')

      const parent = button.parentElement
      if (parent && !parent.querySelector('[data-atendepro-finalize-help]')) {
        const helper = document.createElement('div')
        helper.dataset.atendeproFinalizeHelp = 'true'
        helper.className = 'mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-700'
        helper.textContent = 'Ao finalizar, o pagamento é registrado, o atendimento é concluído e o agradecimento é enviado automaticamente.'
        parent.insertBefore(helper, button)
      }
    }
  }

  document.querySelectorAll('option, p, h2, span').forEach((element) => replaceTextNodes(element))
}

export function AppointmentModalEnhancer() {
  useEffect(() => {
    enhanceAppointmentModal()
    const observer = new MutationObserver(enhanceAppointmentModal)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
