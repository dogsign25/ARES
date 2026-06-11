package com.ares.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Lazy; // 💡 Lazy 임포트
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
// 💡 @RequiredArgsConstructor를 제거하고 순환 참조 방지를 위해 수동 주입합니다.
public class JwtFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    // 💡 생성자에 @Lazy를 붙여 컴포넌트 로딩 시점의 충돌을 원천 차단합니다.
    public JwtFilter(@Lazy JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        String requestURI = request.getRequestURI();

        System.out.println("REQUEST URI = " + requestURI);

        if (requestURI.startsWith("/api/missions/active-zone")) {
            chain.doFilter(request, response);
            return;
        }

        String token = extractToken(request);

        if (token != null && jwtProvider.validate(token)) {
            String username = jwtProvider.getUsername(token);
            String role = jwtProvider.getRole(token);

            System.out.println("DEBUG: Username=" + username + ", Role from Token=" + role);

            String authority = role.startsWith("ROLE_") ? role : "ROLE_" + role;

            var auth = new UsernamePasswordAuthenticationToken(
                    username,
                    null,
                    List.of(new SimpleGrantedAuthority(authority))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}