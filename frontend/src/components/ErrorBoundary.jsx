import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('PAGE CRASH:', error, errorInfo)
    this.setState({ info: errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-red-200 p-6 max-w-2xl w-full">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">页面加载出错</h2>
            <p className="text-sm text-gray-600 mb-2 font-mono bg-red-50 px-3 py-2 rounded">
              {String(this.state.error?.message || this.state.error || '未知错误')}
            </p>
            {this.state.info?.componentStack && (
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer">📍 错误堆栈（点开看具体位置）</summary>
                <pre className="text-xs text-gray-600 mt-2 p-3 bg-gray-50 rounded overflow-auto max-h-40">
                  {this.state.info.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => { this.setState({ hasError: false, error: null, info: null }); window.location.reload() }}
              className="mt-4 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}