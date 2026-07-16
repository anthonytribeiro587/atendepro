'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  deploymentMode: string
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR')
}

function ensureNoteAfter(heading: Element, id: string, text: string, tone: 'blue' | 'amber' = 'blue') {
  if (document.getElementById(id)) return

  const note = document.createElement('div')
  note.id = id
  note.className = tone === 'amber'
    ? 'mt-3 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800'
    : 'mt-3 mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800'
  note.textContent = text
  heading.insertAdjacentElement('afterend', note)
}

export function SettingsExperiencePolish({ deploymentMode }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (deploymentMode !== 'saas' && searchParams.get('tab') === 'billing') {
      router.replace('/settings?tab=general')
      const timer = window.setTimeout(() => {
        const shell = document.getElementById('atendepro-settings-shell')
        const buttons = Array.from(shell?.querySelectorAll('button') ?? [])
        const general = buttons.find((button) => {
          const label = normalize(button.textContent ?? '')
          return label === 'geral' || label === 'general'
        })
        general?.click()
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [deploymentMode, router, searchParams])

  useEffect(() => {
    let frame = 0

    const apply = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const shell = document.getElementById('atendepro-settings-shell')
        if (!shell) return

        const settingsRoot = shell.firstElementChild as HTMLElement | null
        const tabBar = settingsRoot?.firstElementChild as HTMLElement | null

        if (tabBar) {
          const buttons = Array.from(tabBar.querySelectorAll('button'))
          for (const button of buttons) {
            const label = normalize(button.textContent ?? '')

            if (deploymentMode !== 'saas' && (label === 'faturamento' || label === 'billing')) {
              button.style.display = 'none'
              continue
            }

            if (label === 'módulos' || label === 'modules') {
              button.textContent = 'Recursos'
              button.title = 'Escolha quais partes do sistema aparecem no menu.'
            }

            if (label === 'funcionários' || label === 'employees') {
              button.textContent = 'Equipe'
            }

            if (label === 'domínio' || label === 'domain') {
              button.title = 'Opcional: use seu próprio endereço para a página de agendamento.'
            }
          }
        }

        const headings = Array.from(shell.querySelectorAll('h1, h2, h3'))
        for (const heading of headings) {
          const label = normalize(heading.textContent ?? '')

          if (label === 'módulos de funcionalidades') {
            heading.textContent = 'Recursos do sistema'
          }

          if (label === 'domínio personalizado') {
            ensureNoteAfter(
              heading,
              'atendepro-domain-helper',
              'Opcional: o link padrão do AtendePRO já funciona normalmente. Configure esta área somente quando o negócio tiver um domínio próprio.',
              'blue'
            )
          }

          if (label === 'programa de fidelidade') {
            ensureNoteAfter(
              heading,
              'atendepro-loyalty-helper',
              'Defina quantos pontos cada R$ 1 gera e qual desconto será liberado ao atingir a meta. Antes de usar com clientes reais, faça uma venda de teste e confira o saldo no cadastro do cliente.',
              'amber'
            )
          }
        }
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [deploymentMode])

  return (
    <style>{`
      #atendepro-settings-shell > div:first-child {
        width: 100% !important;
        max-width: 72rem !important;
      }

      #atendepro-settings-shell > div:first-child > div:first-child {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        max-width: 100% !important;
        scrollbar-width: none;
        position: sticky;
        top: 3.5rem;
        z-index: 15;
      }

      #atendepro-settings-shell > div:first-child > div:first-child::-webkit-scrollbar {
        display: none;
      }

      #atendepro-settings-shell > div:first-child > div:first-child button {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
      }

      @media (max-width: 640px) {
        #atendepro-settings-shell > div:first-child {
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
        }
      }
    `}</style>
  )
}
