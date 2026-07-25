package uz.olympy.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS for the REST entry points ({@code /api/duel/**}, {@code /api/quiz/**}).
 * The frontend (Vite dev server or a separately-hosted production build) calls
 * these from a different origin than this service.
 *
 * <p>Wide open by design, matching {@code setAllowedOriginPatterns("*")} already
 * used for the {@code /ws/duel} and {@code /ws/quiz} WebSocket handshakes: these
 * endpoints carry no cookies/ambient browser credentials (the caller sends its
 * JWT in the request body, not as a cookie), so the real security boundary is
 * the Django token introspection, not CORS origin-checking.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*");
    }
}
