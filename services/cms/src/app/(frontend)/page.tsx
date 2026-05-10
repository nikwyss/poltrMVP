import React from 'react'
import './styles.css'

export default function HomePage() {
  return (
    <div className="home">
      <div className="content">
        <h1>POLTR CMS</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          This is an internal content management system.
        </p>
        <div className="links">
          <a className="admin" href="/admin">
            Admin Panel
          </a>
        </div>
      </div>
    </div>
  )
}
