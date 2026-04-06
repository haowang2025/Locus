import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export default function ErrorPage() {
  const error = useRouteError()

  let message = 'Unknown error'
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`
  } else if (error instanceof Error) {
    message = error.message
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">出错了</h1>
      </header>
      <main className="page__body">
        <p className="hint">{message}</p>
        <p>
          <Link to="/">返回首页</Link>
        </p>
      </main>
    </div>
  )
}

