import { useState } from "react";

const ArgumentDetail = () => {
  const [userRating, setUserRating] = useState(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([
    {
      id: 1,
      author: "Matterhorn",
      time: "2h",
      text: "Das stimmt nur teilweise. Das Gesetz sieht gerade Förderung von Innovation vor – 1.2 Mrd. für klimaschonende Technologien.",
      likes: 12,
      replies: 3,
    },
    {
      id: 2,
      author: "Pilatus",
      time: "4h",
      text: "Innovation allein reicht nicht. Ohne verbindliche Ziele fehlt der Anreiz für die Wirtschaft, wirklich umzusteigen.",
      likes: 8,
      replies: 1,
    },
  ]);

  const ratings = { strong: 24, medium: 31, weak: 18 };
  const totalRatings = ratings.strong + ratings.medium + ratings.weak;

  const handleRate = (level) => {
    setUserRating(userRating === level ? null : level);
  };

  const handleSubmitComment = () => {
    if (commentText.trim()) {
      setComments([
        {
          id: Date.now(),
          author: "Eiger",
          time: "now",
          text: commentText,
          likes: 0,
          replies: 0,
        },
        ...comments,
      ]);
      setCommentText("");
      setShowCommentInput(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f6f7f9",
      fontFamily: "'Söhne', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Top nav */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e8eaed",
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 600,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          height: 52,
          gap: 12,
        }}>
          <button style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            color: "#444",
            padding: "4px 8px",
            borderRadius: 8,
          }}>←</button>
          <span style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1a1a",
            letterSpacing: "-0.01em",
          }}>Argument</span>
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: 11,
            color: "#8b8f96",
            fontWeight: 500,
            background: "#f0f1f3",
            padding: "4px 10px",
            borderRadius: 20,
            letterSpacing: "0.02em",
          }}>CONTRA</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>
        
        {/* Ballot context pill */}
        <div style={{
          marginTop: 16,
          padding: "10px 14px",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e8eaed",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #e8f4ec, #c8e6d0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}>🗳</div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a1a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>Klima- und Innovationsgesetz</div>
            <div style={{
              fontSize: 11.5,
              color: "#8b8f96",
              marginTop: 1,
            }}>Volksabstimmung · 18. Juni 2023</div>
          </div>
          <div style={{ flex: 1 }} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
            <path d="M6 4l4 4-4 4" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* The argument card */}
        <div style={{
          marginTop: 12,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e8eaed",
          overflow: "hidden",
        }}>
          {/* Contra indicator bar */}
          <div style={{
            height: 3,
            background: "linear-gradient(90deg, #e74c3c, #c0392b)",
          }} />

          <div style={{ padding: "20px 18px" }}>
            {/* Author & meta */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#fff",
                fontWeight: 600,
              }}>JU</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>Jungfreisinnige</div>
                <div style={{ fontSize: 11.5, color: "#8b8f96" }}>3d · Peer-reviewed ✓</div>
              </div>
            </div>

            {/* Argument text */}
            <p style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "#1a1a1a",
              margin: 0,
              letterSpacing: "-0.01em",
            }}>
              Statt Verboten, neuen und hohen Kosten für die Bürger und Technologiefeindlichkeit sollte besser mehr in Forschung, Innovation und Technik investiert werden.
            </p>

            {/* Source link */}
            <div style={{
              marginTop: 14,
              fontSize: 12,
              color: "#8b8f96",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M5 3H3a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V7M7 2h3v3M10 2L5.5 6.5" stroke="#8b8f96" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Quelle: jfrk.ch/abstimmungen
            </div>
          </div>

          {/* Rating section */}
          <div style={{
            borderTop: "1px solid #f0f1f3",
            padding: "16px 18px",
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#8b8f96",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}>Wie überzeugend findest du dieses Argument?</div>

            <div style={{ display: "flex", gap: 8 }}>
              {[
                { key: "strong", label: "Stark", emoji: "💪", color: "#27ae60", bg: "#e8f8ef" },
                { key: "medium", label: "Mittel", emoji: "🤔", color: "#f39c12", bg: "#fef9e7" },
                { key: "weak", label: "Schwach", emoji: "👎", color: "#e74c3c", bg: "#fde8e8" },
              ].map(({ key, label, emoji, color, bg }) => (
                <button
                  key={key}
                  onClick={() => handleRate(key)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "12px 8px",
                    border: userRating === key ? `2px solid ${color}` : "2px solid #e8eaed",
                    borderRadius: 12,
                    background: userRating === key ? bg : "#fafafa",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{emoji}</span>
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: userRating === key ? color : "#555",
                  }}>{label}</span>
                </button>
              ))}
            </div>

            {/* Rating distribution bar */}
            <div style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <div style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "#f0f1f3",
                overflow: "hidden",
                display: "flex",
              }}>
                <div style={{ width: `${(ratings.strong / totalRatings) * 100}%`, background: "#27ae60", transition: "width 0.3s" }} />
                <div style={{ width: `${(ratings.medium / totalRatings) * 100}%`, background: "#f39c12", transition: "width 0.3s" }} />
                <div style={{ width: `${(ratings.weak / totalRatings) * 100}%`, background: "#e74c3c", transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 11, color: "#8b8f96", whiteSpace: "nowrap" }}>{totalRatings} Bewertungen</span>
            </div>
          </div>

          {/* Action bar */}
          <div style={{
            borderTop: "1px solid #f0f1f3",
            padding: "10px 18px",
            display: "flex",
            gap: 4,
          }}>
            {[
              { icon: "💬", label: `${comments.length + 1} Diskussion`, action: () => setShowCommentInput(!showCommentInput) },
              { icon: "🔗", label: "Teilen", action: () => {} },
              { icon: "⚑", label: "Melden", action: () => {} },
            ].map(({ icon, label, action }, i) => (
              <button
                key={i}
                onClick={action}
                style={{
                  flex: i === 0 ? 2 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#555",
                  fontWeight: 500,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.target.style.background = "#f6f7f9"}
                onMouseLeave={e => e.target.style.background = "transparent"}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment input */}
        {showCommentInput && (
          <div style={{
            marginTop: 12,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8eaed",
            padding: "14px 16px",
          }}>
            <div style={{
              display: "flex",
              gap: 10,
            }}>
              <div style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #43b692, #2ecc71)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: "#fff",
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 2,
              }}>EI</div>
              <div style={{ flex: 1 }}>
                <textarea
                  placeholder="Dein Kommentar..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 60,
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "#1a1a1a",
                    fontFamily: "inherit",
                    background: "transparent",
                  }}
                />
                <div style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}>
                  <button
                    onClick={handleSubmitComment}
                    style={{
                      padding: "7px 18px",
                      borderRadius: 20,
                      border: "none",
                      background: commentText.trim() ? "#1a1a1a" : "#e0e0e0",
                      color: commentText.trim() ? "#fff" : "#999",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: commentText.trim() ? "pointer" : "default",
                      transition: "all 0.15s",
                    }}
                  >Senden</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Discussion thread */}
        <div style={{ marginTop: 12, marginBottom: 32 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#555",
            padding: "0 4px",
            marginBottom: 10,
          }}>Diskussion</div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {comments.map((c, i) => (
              <div
                key={c.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e8eaed",
                  borderRadius: i === 0 ? "14px 14px 4px 4px" : i === comments.length - 1 ? "4px 4px 14px 14px" : "4px",
                  padding: "14px 16px",
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}>
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: i === 0 ? "linear-gradient(135deg, #667eea, #5a67d8)" : "linear-gradient(135deg, #ed8936, #dd6b20)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 700,
                  }}>{c.author.substring(0, 2).toUpperCase()}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{c.author}</span>
                  <span style={{ fontSize: 11.5, color: "#aaa" }}>· {c.time}</span>
                </div>
                <p style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "#333",
                  margin: "0 0 10px 0",
                }}>{c.text}</p>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 12,
                  color: "#8b8f96",
                }}>
                  <span style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    ▲ {c.likes}
                  </span>
                  <span style={{ cursor: "pointer" }}>
                    {c.replies > 0 ? `${c.replies} Antworten` : "Antworten"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArgumentDetail;
