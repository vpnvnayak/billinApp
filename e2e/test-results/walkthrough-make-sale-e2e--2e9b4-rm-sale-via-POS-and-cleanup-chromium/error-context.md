# Page snapshot

```yaml
- generic [ref=e5]:
  - heading "Sign in to DinoPos" [level=2] [ref=e6]
  - region "Sign in to DinoPos" [ref=e8]:
    - generic [ref=e9]:
      - generic [ref=e10]: DP
      - heading "DinoPos" [level=1] [ref=e12]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Email
        - textbox "Email" [ref=e16]:
          - /placeholder: you@example.com
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - generic [ref=e19]:
          - textbox "Password Show password" [ref=e20]:
            - /placeholder: Enter your password
          - button "Show password" [ref=e21] [cursor=pointer]:
            - img [ref=e22]
      - generic [ref=e25]:
        - generic [ref=e26]:
          - checkbox "Remember me" [ref=e27]
          - text: Remember me
        - link "Forgot?" [ref=e28] [cursor=pointer]:
          - /url: "#"
      - button "Sign in" [ref=e30] [cursor=pointer]
    - generic [ref=e32]:
      - text: Need an account?
      - link "Register" [ref=e33] [cursor=pointer]:
        - /url: "#"
      - text: .
```