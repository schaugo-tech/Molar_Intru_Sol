import { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  actions?: ReactNode
}

export default function PanelCard({ title, children, actions }: Props) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h3>{title}</h3>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="panel-card__body">{children}</div>
    </section>
  )
}
