import type { TraceData, CapturedEvent } from '../types/events'
import type { SourceFileCache } from '../hooks/useSourceHitMap'

const now = Date.now()

const trace1Events: CapturedEvent[] = [
  {
    id: 'tour-evt-1a',
    traceId: 'tour-trace-1',
    type: 'dom',
    timestamp: now - 5000,
    seq: 0,
    url: 'http://localhost:3099/',
    data: {
      eventType: 'click',
      target: '<button class="btn-primary">Submit</button>',
      tagName: 'BUTTON',
      className: 'btn-primary',
      textContent: 'Submit'
    },
    sourceStack:
      'at handleSubmit (http://localhost:3099/src/components/TodoForm.tsx:24:5)\n' +
      'at onClick (http://localhost:3099/src/components/TodoForm.tsx:42:11)'
  },
  {
    id: 'tour-evt-1b',
    traceId: 'tour-trace-1',
    type: 'network-request',
    timestamp: now - 4950,
    seq: 1,
    url: 'http://localhost:3099/',
    data: {
      requestId: 'tour-req-1',
      method: 'POST',
      url: 'http://localhost:3099/api/todos',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"Buy groceries","completed":false}'
    },
    sourceStack:
      'at createTodo (http://localhost:3099/src/api/todos.ts:12:3)\n' +
      'at handleSubmit (http://localhost:3099/src/components/TodoForm.tsx:26:5)'
  },
  {
    id: 'tour-evt-1c',
    traceId: 'tour-trace-1',
    type: 'network-response',
    timestamp: now - 4808,
    seq: 2,
    url: 'http://localhost:3099/',
    data: {
      requestId: 'tour-req-1',
      method: 'POST',
      url: 'http://localhost:3099/api/todos',
      status: 201,
      statusText: 'Created',
      duration: 142,
      bodyPreview: '{"id":7,"title":"Buy groceries","completed":false}'
    },
    sourceStack:
      'at createTodo (http://localhost:3099/src/api/todos.ts:14:3)\n' +
      'at handleSubmit (http://localhost:3099/src/components/TodoForm.tsx:26:5)'
  },
  {
    id: 'tour-evt-1d',
    traceId: 'tour-trace-1',
    type: 'state-change',
    timestamp: now - 4770,
    seq: 3,
    url: 'http://localhost:3099/',
    data: {
      component: 'TodoList',
      hookIndex: 0,
      prevValue: '[]',
      value: '[{"id":7,"title":"Buy groceries","completed":false}]'
    },
    sourceStack:
      'at TodoList (http://localhost:3099/src/components/TodoList.tsx:8:3)'
  },
  {
    id: 'tour-evt-1e',
    traceId: 'tour-trace-1',
    type: 'console',
    timestamp: now - 4750,
    seq: 4,
    url: 'http://localhost:3099/',
    data: {
      level: 'log',
      args: ['Todo created successfully']
    },
    sourceStack:
      'at handleSubmit (http://localhost:3099/src/components/TodoForm.tsx:30:5)'
  }
]

const trace2Events: CapturedEvent[] = [
  {
    id: 'tour-evt-2a',
    traceId: 'tour-trace-2',
    type: 'dom',
    timestamp: now - 3000,
    seq: 5,
    url: 'http://localhost:3099/',
    data: {
      eventType: 'click',
      target: '<button class="btn-secondary">Load Data</button>',
      tagName: 'BUTTON',
      className: 'btn-secondary',
      textContent: 'Load Data'
    },
    sourceStack:
      'at handleLoad (http://localhost:3099/src/components/UserList.tsx:15:5)\n' +
      'at onClick (http://localhost:3099/src/components/UserList.tsx:38:11)'
  },
  {
    id: 'tour-evt-2b',
    traceId: 'tour-trace-2',
    type: 'network-request',
    timestamp: now - 2990,
    seq: 6,
    url: 'http://localhost:3099/',
    data: {
      requestId: 'tour-req-2',
      method: 'GET',
      url: 'http://localhost:3099/api/users'
    },
    sourceStack:
      'at fetchUsers (http://localhost:3099/src/api/users.ts:5:3)\n' +
      'at handleLoad (http://localhost:3099/src/components/UserList.tsx:17:5)'
  },
  {
    id: 'tour-evt-2c',
    traceId: 'tour-trace-2',
    type: 'network-error',
    timestamp: now - 2790,
    seq: 7,
    url: 'http://localhost:3099/',
    data: {
      requestId: 'tour-req-2',
      method: 'GET',
      url: 'http://localhost:3099/api/users',
      error: 'Failed to fetch',
      duration: 3200
    },
    sourceStack:
      'at fetchUsers (http://localhost:3099/src/api/users.ts:5:3)\n' +
      'at handleLoad (http://localhost:3099/src/components/UserList.tsx:17:5)'
  }
]

const TOUR_TRACE_1: TraceData = {
  id: 'tour-trace-1',
  startTime: trace1Events[0].timestamp,
  endTime: trace1Events[trace1Events.length - 1].timestamp,
  events: trace1Events,
  url: 'http://localhost:3099/',
  rootEvent: trace1Events[0]
}

const TOUR_TRACE_2: TraceData = {
  id: 'tour-trace-2',
  startTime: trace2Events[0].timestamp,
  endTime: trace2Events[trace2Events.length - 1].timestamp,
  events: trace2Events,
  url: 'http://localhost:3099/',
  rootEvent: trace2Events[0]
}

export const TOUR_MOCK_TRACES: TraceData[] = [TOUR_TRACE_1, TOUR_TRACE_2]

// ---------------------------------------------------------------------------
// Mock source file content — line numbers match the sourceStack references
// ---------------------------------------------------------------------------

const SRC_TODO_FORM = `import { useState } from 'react'
import { createTodo } from '../api/todos'

interface TodoFormProps {
  onCreated: () => void
}

export function TodoForm({ onCreated }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (value: string): boolean => {
    if (!value.trim()) {
      setError('Title is required')
      return false
    }
    setError(null)
    return true
  }

  const handleSubmit = async () => {
    if (!validate(title)) return
    setLoading(true)
    try {
      await createTodo({ title, completed: false })
      setTitle('')
      onCreated()

      console.log('Todo created successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        disabled={loading}
      />
      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Saving...' : 'Submit'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}`

const SRC_TODOS_API = `import type { Todo } from '../types'

const API_BASE = '/api/todos'

interface CreateTodoInput {
  title: string
  completed: boolean
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(\`Failed to create todo: \${response.statusText}\`)
  }
  return response.json()
}

export async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) throw new Error('Failed to fetch todos')
  return response.json()
}`

const SRC_TODO_LIST = `import { useState, useEffect } from 'react'
import { fetchTodos } from '../api/todos'
import type { Todo } from '../types'

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTodos()
      .then(setTodos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spinner" />
  if (error) return <p className="error">{error}</p>

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <li key={todo.id} className={todo.completed ? 'done' : ''}>
          <span>{todo.title}</span>
        </li>
      ))}
      {todos.length === 0 && <li className="empty">No todos yet</li>}
    </ul>
  )
}`

const SRC_USER_LIST = `import { useState } from 'react'
import { fetchUsers } from '../api/users'
import type { User } from '../types'

export function UserList() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  if (error) return <p className="error">{error}</p>
  if (loading) return <div className="spinner" />

  return (
    <div>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>{u.name} &lt;{u.email}&gt;</li>
        ))}
      </ul>
      <button className="btn-secondary" onClick={handleLoad}>
        {users.length ? 'Refresh' : 'Load Data'}
      </button>
    </div>
  )
}`

const SRC_USERS_API = `import type { User } from '../types'

const API_BASE = '/api/users'

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) throw new Error('Failed to fetch users')
  return response.json()
}`

export const TOUR_SOURCE_FILES: Map<string, SourceFileCache> = new Map([
  ['http://localhost:3099/src/components/TodoForm.tsx', { content: SRC_TODO_FORM, loading: false, error: null }],
  ['http://localhost:3099/src/api/todos.ts', { content: SRC_TODOS_API, loading: false, error: null }],
  ['http://localhost:3099/src/components/TodoList.tsx', { content: SRC_TODO_LIST, loading: false, error: null }],
  ['http://localhost:3099/src/components/UserList.tsx', { content: SRC_USER_LIST, loading: false, error: null }],
  ['http://localhost:3099/src/api/users.ts', { content: SRC_USERS_API, loading: false, error: null }],
])

// ---------------------------------------------------------------------------
// Derived console + inspector entries (matching hook return shapes)
// ---------------------------------------------------------------------------

export interface DemoConsoleEntry {
  id: string
  timestamp: number
  level: string
  message: string
}

export interface DemoStateChangeEntry {
  id: string
  traceId: string
  timestamp: number
  component: string
  hookIndex: number
  prevValue: string
  value: string
}

export interface DemoResponseEntry {
  id: string
  traceId: string
  timestamp: number
  method: string
  url: string
  status: number
  statusText: string
  duration: number
  bodyPreview?: string
}

export const TOUR_CONSOLE_ENTRIES: DemoConsoleEntry[] = [
  {
    id: 'tour-evt-1e',
    timestamp: now - 4750,
    level: 'log',
    message: 'Todo created successfully'
  }
]

export const TOUR_STATE_CHANGES: DemoStateChangeEntry[] = [
  {
    id: 'tour-evt-1d',
    traceId: 'tour-trace-1',
    timestamp: now - 4770,
    component: 'TodoList',
    hookIndex: 0,
    prevValue: '[]',
    value: '[{"id":7,"title":"Buy groceries","completed":false}]'
  }
]

export const TOUR_RESPONSES: DemoResponseEntry[] = [
  {
    id: 'tour-evt-1c',
    traceId: 'tour-trace-1',
    timestamp: now - 4808,
    method: 'POST',
    url: 'http://localhost:3099/api/todos',
    status: 201,
    statusText: 'Created',
    duration: 142,
    bodyPreview: '{"id":7,"title":"Buy groceries","completed":false}'
  }
]
