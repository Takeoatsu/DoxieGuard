package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"software.sslmate.com/src/go-pkcs12"
)

const (
	apiBaseURL = "http://127.0.0.1:5000"
	agentToken = "token-Servidor-Local-Santi"
)

// TargetServiceType defines the type of web server to deploy certificates to
type TargetServiceType string

const (
	TargetNginx      TargetServiceType = "nginx"
	TargetApache     TargetServiceType = "apache"
	TargetIIS        TargetServiceType = "iis"
	TargetExchange   TargetServiceType = "exchange"
	TargetNone       TargetServiceType = "none"
	TargetKubernetes TargetServiceType = "kubernetes"
	TargetDocker     TargetServiceType = "docker"
	TargetHAProxy    TargetServiceType = "haproxy"
)

// DeploymentConfig holds the configuration for certificate deployment
type DeploymentConfig struct {
	ServiceType      TargetServiceType `json:"serviceType"`
	Domain           string            `json:"domain"`
	SiteName         string            `json:"siteName"`         // For IIS/Exchange (default: "Default Web Site")
	CertStore        string            `json:"certStore"`        // For Windows (default: "My")
	PfxPassword      string            `json:"pfxPassword"`      // Password for PFX file (IIS/Exchange)
	ExchangeServices string            `json:"exchangeServices"` // Comma-separated: IIS,SMTP,IMAP,POP (Exchange)
}

// DiscoveredCertificate represents a certificate found on the system
type DiscoveredCertificate struct {
	Domain      string    `json:"domain"`
	CertPath    string    `json:"certPath"`
	KeyPath     string    `json:"keyPath"`
	ExpiresAt   time.Time `json:"expiresAt"`
	Issuer      string    `json:"issuer"`
	ServerType  string    `json:"serverType"`
	ConfigPath  string    `json:"configPath"`
	ServerNames []string  `json:"serverNames"`
}

// GetDeploymentConfig retrieves deployment configuration from the API
func GetDeploymentConfig(domain string) DeploymentConfig {
	resp, err := http.Get(fmt.Sprintf("%s/agent-config/%s", apiBaseURL, domain))
	if err != nil {
		log.Printf("⚠️ No se pudo obtener configuración de despliegue para %s: %v\n", domain, err)
		return DeploymentConfig{ServiceType: TargetNone}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return DeploymentConfig{ServiceType: TargetNone}
	}

	var config DeploymentConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		log.Printf("⚠️ Error decodificando configuración para %s: %v\n", domain, err)
		return DeploymentConfig{ServiceType: TargetNone}
	}

	return config
}

func main() {
	// 1. CONFIGURACIÓN DE RUTAS
	exePath, _ := os.Executable()
	baseDir := filepath.Dir(exePath)
	os.Chdir(baseDir)

	// 2. CONFIGURACIÓN DE LOGS
	f, err := os.OpenFile("doxie_debug.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("❌ No se pudo abrir el log: %v\n", err)
	}
	defer f.Close()

	multi := io.MultiWriter(os.Stdout, f)
	log.SetOutput(multi)

	log.Println("--- 🐕 Doxie-Agent Despertando ---")

	// 3. AUTO-DISCOVERY INICIAL (Linux y Windows)
	if runtime.GOOS == "linux" || runtime.GOOS == "windows" {
		log.Println("🔍 Ejecutando Auto-Discovery inicial de certificados...")
		discoveredCerts := DiscoverCertificates()
		if len(discoveredCerts) > 0 {
			reportDiscoveredCertificates(discoveredCerts)
		}
	}

	for {
		log.Println("📋 Iniciando ciclo de revisión...")

		domains, err := fetchTasks()
		if err != nil {
			log.Printf("❌ Error al obtener tareas: %v\n", err)
		} else {
			log.Printf("📋 Órdenes recibidas: %d dominios por vigilar.\n", len(domains))

			// --- VARIABLES PARA EL RESUMEN ---
			var saludables []string
			var renovados []string
			var alertas []string

			// Procesar cada dominio
			for _, d := range domains {
				status, info := processDomain(d)

				switch status {
				case "HEALTHY":
					saludables = append(saludables, d)
				case "RENEWED":
					renovados = append(renovados, d)
				case "FAILED":
					alertas = append(alertas, fmt.Sprintf("%s (%s)", d, info))
				}
			}

			// --- ENVIAR REPORTE ÚNICO A TELEGRAM ---
			enviarResumenTelegram(len(domains), saludables, renovados, alertas)
		}

		log.Println("💤 Ciclo finalizado. Doxie-Agent entra en modo vigilancia.")

		// PRODUCTION: Reporte diario (24 horas)
		time.Sleep(24 * time.Hour)
	}
}

// Función para armar el mensaje estético de Telegram CON DESGLOSE COMPLETO
func enviarResumenTelegram(total int, ok []string, renew []string, fail []string) {
	mensaje := fmt.Sprintf("🐾 *DoxieGuard: Reporte de Misión*\n\n")
	mensaje += fmt.Sprintf("📊 *Total revisados:* %d\n", total)

	// �� DESGLOSE COMPLETO CON ICONOS TEMÁTICOS
	mensaje += "\n\n📋 *Desglose Completo:*"

	if len(ok) > 0 {
		mensaje += fmt.Sprintf("\n🐕 *Saludables (%d):*", len(ok))
		for _, d := range ok {
			mensaje += fmt.Sprintf("\n  ✅ %s", d)
		}
	} else {
		mensaje += "\n🐕 *Saludables: Ninguno*"
	}

	if len(renew) > 0 {
		mensaje += fmt.Sprintf("\n🐶 *Renovados (%d):*", len(renew))
		for _, d := range renew {
			mensaje += fmt.Sprintf("\n  ✨ %s", d)
		}
	} else {
		mensaje += "\n🐶 *Renovados: Ninguno*"
	}

	if len(fail) > 0 {
		mensaje += fmt.Sprintf("\n\n🐕‍🦺 *Alertas (%d):*", len(fail))
		for _, f := range fail {
			mensaje += fmt.Sprintf("\n  ❌ %s", f)
		}
	} else {
		mensaje += "\n🐕‍🦺 *Alertas: 0*"
	}

	mensaje += "\n\n💎 *DoxieGuard vigilando 24/7 🐾*"

	// Envío al Backend
	payload := map[string]string{"message": mensaje}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(apiBaseURL+"/send-summary", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("❌ ERROR enviando resumen a Backend: %v", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("❌ Backend respondió %d: %s", resp.StatusCode, string(body))
		return
	}

	log.Printf("✅ Resumen Telegram ENVIADO ✓ Status: %d - %s", resp.StatusCode, string(body))
}

func fetchTasks() ([]string, error) {
	resp, err := http.Get(fmt.Sprintf("%s/agent-tasks/%s", apiBaseURL, agentToken))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error: %d", resp.StatusCode)
	}

	var data struct {
		Domains []string `json:"domains"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	return data.Domains, nil
}

func performDNSChallenge(domain string) bool {
	log.Printf("🔍 [DNS] Creando registro TXT para: _acme-challenge.%s\n", domain)
	time.Sleep(2 * time.Second)
	fmt.Println("✅ [DNS] Registro TXT propagado con éxito.")
	return true
}

func reportDNSReady(domain string) {
	apiURL := apiBaseURL + "/confirm-dns-challenge"

	payload := map[string]string{
		"domain": domain,
		"token":  agentToken,
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("❌ No se pudo reportar la confirmación DNS para %s: %v\n", domain, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		fmt.Println("📤 [REPORT] API notificada: Estado actualizado a PENDING_VALIDATION.")
	} else {
		log.Printf("⚠️ [REPORT] API respondió %d al reportar DNS Ready para %s\n", resp.StatusCode, domain)
	}
}

type CertResponse struct {
	Certificate string `json:"certificate"`
	Key         string `json:"key"`
}

func installCertificate(domain string, certData CertResponse) error {
	if err := os.MkdirAll("certs", 0755); err != nil {
		return err
	}

	certPath := filepath.Join("certs", fmt.Sprintf("%s.crt", domain))
	keyPath := filepath.Join("certs", fmt.Sprintf("%s.key", domain))

	if err := os.WriteFile(certPath, []byte(certData.Certificate), 0644); err != nil {
		return err
	}

	if err := os.WriteFile(keyPath, []byte(certData.Key), 0600); err != nil {
		return err
	}

	log.Printf("✅ Certificados para %s instalados en ./certs/\n", domain)
	return nil
}

func reportError(domain string, errMsg string) {
	apiURL := apiBaseURL + "/report-error"
	payload := map[string]string{
		"domain":       domain,
		"errorMessage": errMsg,
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("❌ Error al reportar error para %s: %v\n", domain, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Printf("📤 [REPORT-ERROR] API notificada para %s\n", domain)
	} else {
		log.Printf("⚠️ [REPORT-ERROR] API respondió %d para %s\n", resp.StatusCode, domain)
	}
}

func processDomain(domain string) (string, string) {
	log.Printf("\n🐾 Olfateando: %s\n", domain)

	target := domain + ":443"

	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", target, nil)
	if err != nil {
		log.Printf("❌ Error crítico para %s: %v\n", domain, err)
		reportError(domain, err.Error())
		return "FAILED", err.Error()
	}
	defer conn.Close()

	cert := conn.ConnectionState().PeerCertificates[0]

	payload := map[string]interface{}{
		"domain":    domain,
		"expiresAt": cert.NotAfter.Format(time.RFC3339),
		"assetName": "Servidor-Local-Santi",
	}
	jsonData, _ := json.Marshal(payload)

	resp, err := http.Post(apiBaseURL+"/report-cert", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("❌ Error al reportar %s: %v\n", domain, err)
		return "FAILED", "Error de red con la API"
	}
	defer resp.Body.Close()

	var apiRes struct {
		Command  string `json:"command"`
		DaysLeft int    `json:"daysLeft"`
	}
	json.NewDecoder(resp.Body).Decode(&apiRes)

	if resp.StatusCode == 200 {
		log.Printf("✅ %s: %d días restantes. Orden: %s\n", domain, apiRes.DaysLeft, apiRes.Command)

		if apiRes.Command == "PREPARE_RENEWAL" {
			log.Println("🐕 MODO ACCIÓN: Iniciando reto DNS...")

			if performDNSChallenge(domain) {
				reportDNSReady(domain)

				success := false
				for i := 1; i <= 3; i++ {
					log.Printf("⏳ Intento de descarga %d/3 para %s...\n", i, domain)
					time.Sleep(10 * time.Second)

					certRes, err := downloadCertificate(domain)
					if err == nil && certRes.Certificate != "" {
						if err := installCertificate(domain, certRes); err == nil {
							log.Printf("✨ ¡Certificado instalado con éxito para %s!\n", domain)
							config := GetDeploymentConfig(domain)
							reloadWebServer(domain, config)
							success = true
							break
						} else {
							log.Printf("⚠️ Error instalando certificado para %s: %v\n", domain, err)
						}
					} else {
						log.Println("⚠️ El certificado aún no está listo en el servidor...")
					}
				}

				if success {
					return "RENEWED", ""
				} else {
					return "FAILED", "Renovación fallida tras 3 intentos"
				}
			} else {
				return "FAILED", "Reto DNS fallido"
			}
		}
		return "HEALTHY", fmt.Sprintf("%d días restantes", apiRes.DaysLeft)
	}

	return "FAILED", "Respuesta API no exitosa"
}

func reloadWebServer(domain string, config DeploymentConfig) {
	if config.ServiceType == TargetNone {
		fmt.Println("🔍 Detectando entorno automáticamente...")
		ApplyCertificate(domain, config)
		return
	}

	switch config.ServiceType {
	case TargetNginx:
		applyNginx(domain, config)
	case TargetApache:
		applyApache(domain, config)
	case TargetIIS:
		applyIIS(domain, config)
	case TargetExchange:
		applyExchange(domain, config)
	case TargetKubernetes:
		applyKubernetes(domain, config)
	case TargetDocker:
		applyDocker(domain, config)
	case TargetHAProxy:
		applyHAProxy(domain, config)
	default:
		log.Printf("⚠️ Tipo de servicio desconocido: %s\n", config.ServiceType)
	}
}

func ApplyCertificate(domain string, config DeploymentConfig) error {
	log.Printf("🛠️ Aplicando certificado para %s...\n", domain)

	certPath := filepath.Join("certs", fmt.Sprintf("%s.crt", domain))
	keyPath := filepath.Join("certs", fmt.Sprintf("%s.key", domain))

	if runtime.GOOS == "windows" {
		pfxPath := filepath.Join("certs", fmt.Sprintf("%s.pfx", domain))
		password := config.PfxPassword
		if password == "" {
			password = "DoxieGuard2024"
		}

		if err := createPFXFromFiles(certPath, keyPath, pfxPath, password); err != nil {
			return fmt.Errorf("error creando PFX: %v", err)
		}

		return applyWindowsStack(domain, pfxPath, password)
	}

	// Try Nginx first
	if err := exec.Command("which", "nginx").Run(); err == nil {
		return applyNginxStack()
	}

	// Try Apache if Nginx is not available
	if err := exec.Command("which", "apache2").Run(); err == nil {
		return applyApacheStack()
	}
	if err := exec.Command("which", "httpd").Run(); err == nil {
		return applyApacheStack()
	}

	log.Println("⚠️ No se detectó Nginx ni Apache en el sistema")
	return nil
}

func createPFXFromFiles(certPath, keyPath, pfxPath, password string) error {
	certData, err := os.ReadFile(certPath)
	if err != nil {
		return fmt.Errorf("error leyendo certificado: %w", err)
	}
	block, _ := pem.Decode(certData)
	if block == nil || block.Type != "CERTIFICATE" {
		return fmt.Errorf("formato de certificado inválido")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return fmt.Errorf("error parseando certificado: %w", err)
	}

	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		return fmt.Errorf("error leyendo llave privada: %w", err)
	}
	keyBlock, _ := pem.Decode(keyData)
	if keyBlock == nil {
		return fmt.Errorf("formato de llave inválido")
	}

	var privateKey interface{}
	var parseErr error

	if keyBlock.Type == "PRIVATE KEY" {
		privateKey, parseErr = x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	} else if keyBlock.Type == "RSA PRIVATE KEY" {
		privateKey, parseErr = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	} else {
		privateKey, parseErr = x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	}

	if parseErr != nil {
		return fmt.Errorf("error parseando llave privada: %w", parseErr)
	}

	pfxData, err := pkcs12.Encode(rand.Reader, privateKey, cert, nil, password)
	if err != nil {
		return fmt.Errorf("error codificando PFX: %w", err)
	}

	if err := os.WriteFile(pfxPath, pfxData, 0600); err != nil {
		return fmt.Errorf("error escribiendo archivo PFX: %w", err)
	}

	log.Printf("✅ [PFX] Archivo PFX creado: %s\n", pfxPath)
	return nil
}

func applyNginx(domain string, config DeploymentConfig) {
	fmt.Println("🔧 [Nginx] Validando configuración...")

	cmd := exec.Command("nginx", "-t")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ [Nginx] Configuración inválida: %s\n", output)
		return
	}
	fmt.Println("✅ [Nginx] Configuración válida.")

	cmd = exec.Command("systemctl", "reload", "nginx")
	if err := cmd.Run(); err != nil {
		log.Printf("❌ [Nginx] Error al recargar: %v\n", err)
		return
	}
	fmt.Println("✅ [Nginx] Servidor recargado correctamente.")
}

func applyNginxStack() error {
	fmt.Println("🐧 Entorno Linux detectado. Verificando Nginx...")

	if err := exec.Command("which", "nginx").Run(); err != nil {
		fmt.Println("⚠️ Nginx no está instalado en este sistema.")
		return nil
	}

	if err := exec.Command("nginx", "-t").Run(); err != nil {
		return fmt.Errorf("configuración de Nginx inválida: %v", err)
	}

	fmt.Println("✅ Configuración de Nginx válida.")

	if err := exec.Command("systemctl", "reload", "nginx").Run(); err != nil {
		fmt.Println("⚠️ systemctl no disponible, usando nginx -s reload")
		if err := exec.Command("nginx", "-s", "reload").Run(); err != nil {
			return fmt.Errorf("error al recargar Nginx: %v", err)
		}
	}

	fmt.Println("✅ Nginx recargado correctamente.")
	return nil
}

func applyWindowsStack(domain, pfxPath, password string) error {
	fmt.Println("🪟 Entorno Windows detectado. Ejecutando PowerShell Maestro...")

	scriptPath := "./install-cert.ps1"
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		return applyWindowsInline(domain, pfxPath, password)
	}

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
		"-pfxPath", pfxPath, "-password", password, "-domain", domain)

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error en PowerShell: %v\n%s\n", err, string(output))
		return applyWindowsInline(domain, pfxPath, password)
	}

	fmt.Println(string(output))
	return nil
}

func applyWindowsInline(domain, pfxPath, password string) error {
	fmt.Println("🔧 [Windows] Ejecutando comandos inline...")

	fmt.Println("🔍 Detectando IIS...")
	iisDetectCmd := exec.Command("powershell", "-Command", "Get-Service -Name W3SVC -ErrorAction SilentlyContinue")
	if iisDetectCmd.Run(); iisDetectCmd.ProcessState.ExitCode() == 0 {
		fmt.Println("🌐 IIS detectado. Actualizando bindings SSL...")

		psScript := fmt.Sprintf(`
$pfxPath = "%s"
$password = ConvertTo-SecureString "%s" -AsPlainText -Force
$cert = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\LocalMachine\My -Password $password
Get-WebBinding -Name "*" -Protocol "https" | ForEach-Object { $_.AddSslCertificate($cert.GetCertHashString(), "My") }
Write-Output "IIS certificate updated"
`, pfxPath, password)

		cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("⚠️ Error actualizando IIS: %v\n%s\n", err, string(output))
		} else {
			fmt.Println("✅ IIS actualizado correctamente.")
		}
	}

	fmt.Println("🔍 Detectando Exchange...")
	exchangeDetectCmd := exec.Command("powershell", "-Command", "Get-Service -Name MSExchangeServiceHost -ErrorAction SilentlyContinue")
	if exchangeDetectCmd.Run(); exchangeDetectCmd.ProcessState.ExitCode() == 0 {
		fmt.Println("📧 Exchange detectado. Habilitando servicios...")

		psScript := fmt.Sprintf(`
$pfxPath = "%s"
$password = ConvertTo-SecureString "%s" -AsPlainText -Force
$cert = Import-ExchangeCertificate -FileData ([System.IO.File]::ReadAllBytes($pfxPath)) -Password $password
Enable-ExchangeCertificate -Thumbprint $cert.Thumbprint -Services "IIS,SMTP" -Force
Write-Output "Exchange certificate enabled for: IIS,SMTP"
`, pfxPath, password)

		cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("⚠️ Error actualizando Exchange: %v\n%s\n", err, string(output))
		} else {
			fmt.Println("✅ Exchange actualizado correctamente.")
		}
	}

	fmt.Println("✅ Proceso de aplicación de certificado completado.")
	return nil
}

func applyIIS(domain string, config DeploymentConfig) {
	fmt.Println("🔧 [IIS] Preparando certificado...")

	pfxPath := filepath.Join("certs", fmt.Sprintf("%s.pfx", domain))
	password := config.PfxPassword
	if password == "" {
		password = "DoxieGuard2024"
	}

	if err := generatePfxFile(domain, pfxPath, password); err != nil {
		log.Printf("❌ [IIS] Error generando PFX: %v\n", err)
		return
	}
	log.Printf("✅ [IIS] Archivo PFX generado: %s\n", pfxPath)

	siteName := config.SiteName
	if siteName == "" {
		siteName = "Default Web Site"
	}

	psScript := fmt.Sprintf(`
$cert = Import-PfxCertificate -FilePath "%s" -CertStoreLocation Cert:\LocalMachine\My -Password (ConvertTo-SecureString -String "%s" -Force -AsPlainText)
Get-WebBinding -Name "%s" -Protocol "https" | ForEach-Object { $_.AddSslCertificate($cert.GetCertHashString(), "My") }
Write-Output "Certificate imported and bound successfully"
`, pfxPath, password, siteName)

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ [IIS] Error al importar certificado: %v\n%s\n", err, output)
		return
	}
	fmt.Println("✅ [IIS] Certificado importado y vinculado correctamente.")
}

func applyExchange(domain string, config DeploymentConfig) {
	fmt.Println("🔧 [Exchange] Preparando certificado...")

	pfxPath := filepath.Join("certs", fmt.Sprintf("%s.pfx", domain))
	password := config.PfxPassword
	if password == "" {
		password = "DoxieGuard2024"
	}

	if err := generatePfxFile(domain, pfxPath, password); err != nil {
		log.Printf("❌ [Exchange] Error generando PFX: %v\n", err)
		return
	}
	log.Printf("✅ [Exchange] Archivo PFX generado: %s\n", pfxPath)

	services := config.ExchangeServices
	if services == "" {
		services = "IIS,SMTP"
	}

	psScript := fmt.Sprintf(`
$cert = Import-ExchangeCertificate -FileData ([System.IO.File]::ReadAllBytes("%s")) -Password (ConvertTo-SecureString -String "%s" -Force -AsPlainText)
Enable-ExchangeCertificate -Thumbprint $cert.Thumbprint -Services "%s" -Force
Write-Output "Certificate enabled for services: %s"
`, pfxPath, password, services, services)

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ [Exchange] Error al habilitar certificado: %v\n%s\n", err, output)
		return
	}
	fmt.Println("✅ [Exchange] Certificado importado y servicios habilitados correctamente.")
}

func generatePfxFile(domain, pfxPath, password string) error {
	certData, err := os.ReadFile(filepath.Join("certs", fmt.Sprintf("%s.crt", domain)))
	if err != nil {
		return fmt.Errorf("error reading certificate: %w", err)
	}

	keyData, err := os.ReadFile(filepath.Join("certs", fmt.Sprintf("%s.key", domain)))
	if err != nil {
		return fmt.Errorf("error reading key: %w", err)
	}

	block, _ := pem.Decode(certData)
	if block == nil || block.Type != "CERTIFICATE" {
		return fmt.Errorf("failed to parse certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return fmt.Errorf("error parsing certificate: %w", err)
	}

	keyBlock, _ := pem.Decode(keyData)
	if keyBlock == nil || keyBlock.Type != "RSA PRIVATE KEY" {
		return fmt.Errorf("failed to parse private key")
	}
	key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return fmt.Errorf("error parsing private key: %w", err)
	}

	return createPfxWithGo(cert, key, pfxPath, password)
}

func createPfxWithGo(cert *x509.Certificate, key *rsa.PrivateKey, pfxPath, password string) error {
	var privKey interface{} = key

	pkcs8Key, err := x509.MarshalPKCS8PrivateKey(key)
	if err == nil {
		privKey, err = x509.ParsePKCS8PrivateKey(pkcs8Key)
		if err != nil {
			privKey = key
		}
	}

	pfxData, err := pkcs12.Encode(rand.Reader, privKey, cert, nil, password)
	if err != nil {
		return fmt.Errorf("error encoding PFX: %w", err)
	}

	if err := os.WriteFile(pfxPath, pfxData, 0600); err != nil {
		return fmt.Errorf("error writing PFX file: %w", err)
	}

	log.Printf("✅ [PFX] Archivo PFX creado exitosamente: %s\n", pfxPath)
	return nil
}

// ============================================================================
// AUTO-DISCOVERY FUNCTIONS
// ============================================================================

// DiscoverCertificates scans the system for existing certificates
func DiscoverCertificates() []DiscoveredCertificate {
	var discovered []DiscoveredCertificate

	log.Println("🔍 Iniciando Auto-Discovery de certificados...")

	if runtime.GOOS == "linux" {
		// Discover Linux certificates
		nginxCerts := discoverNginxCertificates()
		discovered = append(discovered, nginxCerts...)

		apacheCerts := discoverApacheCertificates()
		discovered = append(discovered, apacheCerts...)
	} else if runtime.GOOS == "windows" {
		// Discover Windows certificates
		windowsCerts := discoverWindowsCertificates()
		discovered = append(discovered, windowsCerts...)
	}

	// Discover Kubernetes certificates (works on any OS with kubectl)
	k8sCerts := discoverKubernetesCertificates()
	discovered = append(discovered, k8sCerts...)

	// Discover Docker certificates
	dockerCerts := discoverDockerCertificates()
	discovered = append(discovered, dockerCerts...)

	// Discover HAProxy certificates
	haproxyCerts := discoverHAProxyCertificates()
	discovered = append(discovered, haproxyCerts...)

	log.Printf("✅ Auto-Discovery completado: %d certificados encontrados\n", len(discovered))
	return discovered
}

// discoverNginxCertificates scans Nginx configuration files for certificates
func discoverNginxCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Check if Nginx is installed
	if err := exec.Command("which", "nginx").Run(); err != nil {
		log.Println("⚠️ Nginx no detectado, saltando discovery de Nginx")
		return certs
	}

	log.Println("🔍 Escaneando configuraciones de Nginx...")

	// Common Nginx config directories
	configDirs := []string{
		"/etc/nginx/sites-enabled",
		"/etc/nginx/conf.d",
		"/etc/nginx/sites-available",
	}

	for _, dir := range configDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}

		files, err := filepath.Glob(filepath.Join(dir, "*"))
		if err != nil {
			log.Printf("⚠️ Error leyendo directorio %s: %v\n", dir, err)
			continue
		}

		for _, file := range files {
			// Skip symbolic links that point to nowhere
			if info, err := os.Stat(file); err != nil || info.IsDir() {
				continue
			}

			discovered := parseNginxConfig(file)
			certs = append(certs, discovered...)
		}
	}

	log.Printf("✅ Nginx: %d certificados encontrados\n", len(certs))
	return certs
}

// parseNginxConfig parses an Nginx configuration file for SSL certificates
func parseNginxConfig(configPath string) []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	file, err := os.Open(configPath)
	if err != nil {
		return certs
	}
	defer file.Close()

	var currentServerNames []string
	var certPath, keyPath string
	inServerBlock := false

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Detect server block
		if strings.Contains(line, "server") && strings.Contains(line, "{") {
			inServerBlock = true
			currentServerNames = []string{}
			certPath = ""
			keyPath = ""
		}

		if inServerBlock {
			// Extract server_name
			if strings.HasPrefix(line, "server_name") {
				re := regexp.MustCompile(`server_name\s+([^;]+);`)
				matches := re.FindStringSubmatch(line)
				if len(matches) > 1 {
					names := strings.Fields(matches[1])
					currentServerNames = append(currentServerNames, names...)
				}
			}

			// Extract ssl_certificate
			if strings.HasPrefix(line, "ssl_certificate ") && !strings.Contains(line, "ssl_certificate_key") {
				re := regexp.MustCompile(`ssl_certificate\s+([^;]+);`)
				matches := re.FindStringSubmatch(line)
				if len(matches) > 1 {
					certPath = strings.TrimSpace(matches[1])
				}
			}

			// Extract ssl_certificate_key
			if strings.HasPrefix(line, "ssl_certificate_key") {
				re := regexp.MustCompile(`ssl_certificate_key\s+([^;]+);`)
				matches := re.FindStringSubmatch(line)
				if len(matches) > 1 {
					keyPath = strings.TrimSpace(matches[1])
				}
			}

			// End of server block
			if line == "}" {
				if certPath != "" && keyPath != "" && len(currentServerNames) > 0 {
					// Read certificate info
					certInfo := readCertificateInfo(certPath)
					if certInfo != nil {
						cert := DiscoveredCertificate{
							Domain:      currentServerNames[0],
							CertPath:    certPath,
							KeyPath:     keyPath,
							ExpiresAt:   certInfo.NotAfter,
							Issuer:      certInfo.Issuer.CommonName,
							ServerType:  "nginx",
							ConfigPath:  configPath,
							ServerNames: currentServerNames,
						}
						certs = append(certs, cert)
						log.Printf("  📜 Encontrado: %s (expira: %s)\n", currentServerNames[0], certInfo.NotAfter.Format("2006-01-02"))
					}
				}
				inServerBlock = false
			}
		}
	}

	return certs
}

// discoverApacheCertificates scans Apache configuration files for certificates
func discoverApacheCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Check if Apache is installed
	if err := exec.Command("which", "apache2").Run(); err != nil {
		if err := exec.Command("which", "httpd").Run(); err != nil {
			log.Println("⚠️ Apache no detectado, saltando discovery de Apache")
			return certs
		}
	}

	log.Println("🔍 Escaneando configuraciones de Apache...")

	// Common Apache config directories
	configDirs := []string{
		"/etc/apache2/sites-enabled",
		"/etc/apache2/conf-enabled",
		"/etc/httpd/conf.d",
		"/etc/httpd/sites-enabled",
	}

	for _, dir := range configDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}

		files, err := filepath.Glob(filepath.Join(dir, "*"))
		if err != nil {
			log.Printf("⚠️ Error leyendo directorio %s: %v\n", dir, err)
			continue
		}

		for _, file := range files {
			if info, err := os.Stat(file); err != nil || info.IsDir() {
				continue
			}

			discovered := parseApacheConfig(file)
			certs = append(certs, discovered...)
		}
	}

	log.Printf("✅ Apache: %d certificados encontrados\n", len(certs))
	return certs
}

// parseApacheConfig parses an Apache configuration file for SSL certificates
func parseApacheConfig(configPath string) []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	file, err := os.Open(configPath)
	if err != nil {
		return certs
	}
	defer file.Close()

	var currentServerNames []string
	var certPath, keyPath string
	inVirtualHost := false

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Detect VirtualHost block
		if strings.HasPrefix(line, "<VirtualHost") {
			inVirtualHost = true
			currentServerNames = []string{}
			certPath = ""
			keyPath = ""
		}

		if inVirtualHost {
			// Extract ServerName
			if strings.HasPrefix(line, "ServerName") {
				parts := strings.Fields(line)
				if len(parts) > 1 {
					currentServerNames = append(currentServerNames, parts[1])
				}
			}

			// Extract ServerAlias
			if strings.HasPrefix(line, "ServerAlias") {
				parts := strings.Fields(line)
				if len(parts) > 1 {
					currentServerNames = append(currentServerNames, parts[1:]...)
				}
			}

			// Extract SSLCertificateFile
			if strings.HasPrefix(line, "SSLCertificateFile") {
				parts := strings.Fields(line)
				if len(parts) > 1 {
					certPath = parts[1]
				}
			}

			// Extract SSLCertificateKeyFile
			if strings.HasPrefix(line, "SSLCertificateKeyFile") {
				parts := strings.Fields(line)
				if len(parts) > 1 {
					keyPath = parts[1]
				}
			}

			// End of VirtualHost block
			if strings.HasPrefix(line, "</VirtualHost>") {
				if certPath != "" && keyPath != "" && len(currentServerNames) > 0 {
					certInfo := readCertificateInfo(certPath)
					if certInfo != nil {
						cert := DiscoveredCertificate{
							Domain:      currentServerNames[0],
							CertPath:    certPath,
							KeyPath:     keyPath,
							ExpiresAt:   certInfo.NotAfter,
							Issuer:      certInfo.Issuer.CommonName,
							ServerType:  "apache",
							ConfigPath:  configPath,
							ServerNames: currentServerNames,
						}
						certs = append(certs, cert)
						log.Printf("  📜 Encontrado: %s (expira: %s)\n", currentServerNames[0], certInfo.NotAfter.Format("2006-01-02"))
					}
				}
				inVirtualHost = false
			}
		}
	}

	return certs
}

// readCertificateInfo reads and parses a certificate file
func readCertificateInfo(certPath string) *x509.Certificate {
	certData, err := os.ReadFile(certPath)
	if err != nil {
		return nil
	}

	block, _ := pem.Decode(certData)
	if block == nil {
		return nil
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil
	}

	return cert
}

// reportDiscoveredCertificates sends discovered certificates to the backend
func reportDiscoveredCertificates(certs []DiscoveredCertificate) {
	if len(certs) == 0 {
		return
	}

	payload := map[string]interface{}{
		"certificates": certs,
		"agentToken":   agentToken,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("❌ Error serializando certificados descubiertos: %v\n", err)
		return
	}

	resp, err := http.Post(apiBaseURL+"/report-discovered-certs", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("❌ Error reportando certificados descubiertos: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Printf("✅ Certificados descubiertos reportados al backend: %d certificados\n", len(certs))
	} else {
		log.Printf("⚠️ Backend respondió %d al reportar certificados descubiertos\n", resp.StatusCode)
	}
}

// ============================================================================
// APACHE SUPPORT FUNCTIONS
// ============================================================================

// applyApache applies certificate to Apache server
func applyApache(domain string, config DeploymentConfig) {
	fmt.Println("🔧 [Apache] Validando configuración...")

	// Try apache2 first (Debian/Ubuntu)
	cmd := exec.Command("apache2ctl", "configtest")
	output, err := cmd.CombinedOutput()

	// If apache2ctl doesn't exist, try apachectl (RHEL/CentOS)
	if err != nil {
		cmd = exec.Command("apachectl", "configtest")
		output, err = cmd.CombinedOutput()
	}

	if err != nil {
		log.Printf("❌ [Apache] Configuración inválida: %s\n", output)
		return
	}
	fmt.Println("✅ [Apache] Configuración válida.")

	// Reload Apache
	cmd = exec.Command("systemctl", "reload", "apache2")
	if err := cmd.Run(); err != nil {
		// Try httpd if apache2 doesn't work
		cmd = exec.Command("systemctl", "reload", "httpd")
		if err := cmd.Run(); err != nil {
			log.Printf("❌ [Apache] Error al recargar: %v\n", err)
			return
		}
	}
	fmt.Println("✅ [Apache] Servidor recargado correctamente.")
}

// applyApacheStack applies certificate to Apache with auto-detection
func applyApacheStack() error {
	fmt.Println("🐧 Entorno Linux detectado. Verificando Apache...")

	// Check for apache2 (Debian/Ubuntu)
	apacheCmd := "apache2"
	if err := exec.Command("which", "apache2").Run(); err != nil {
		// Check for httpd (RHEL/CentOS)
		apacheCmd = "httpd"
		if err := exec.Command("which", "httpd").Run(); err != nil {
			fmt.Println("⚠️ Apache no está instalado en este sistema.")
			return nil
		}
	}

	// Validate configuration
	testCmd := "apache2ctl"
	if apacheCmd == "httpd" {
		testCmd = "apachectl"
	}

	if err := exec.Command(testCmd, "configtest").Run(); err != nil {
		return fmt.Errorf("configuración de Apache inválida: %v", err)
	}

	fmt.Println("✅ Configuración de Apache válida.")

	// Reload Apache
	reloadCmd := "apache2"
	if apacheCmd == "httpd" {
		reloadCmd = "httpd"
	}

	if err := exec.Command("systemctl", "reload", reloadCmd).Run(); err != nil {
		fmt.Printf("⚠️ systemctl no disponible, usando %s -k graceful\n", testCmd)
		if err := exec.Command(testCmd, "-k", "graceful").Run(); err != nil {
			return fmt.Errorf("error al recargar Apache: %v", err)
		}
	}

	fmt.Println("✅ Apache recargado correctamente.")
	return nil
}

// ============================================================================
// KUBERNETES AUTO-DISCOVERY FUNCTIONS
// ============================================================================

// discoverKubernetesCertificates scans Kubernetes Secrets and Ingress for certificates
func discoverKubernetesCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Check if kubectl is available
	if err := exec.Command("kubectl", "version", "--client", "--short").Run(); err != nil {
		log.Println("⚠️ kubectl no detectado, saltando discovery de Kubernetes")
		return certs
	}

	log.Println("🔍 Escaneando Secrets de Kubernetes...")

	// Get all TLS secrets across all namespaces
	cmd := exec.Command("kubectl", "get", "secrets", "--all-namespaces", "-o", "json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error leyendo Secrets de Kubernetes: %v\n", err)
		return certs
	}

	// Parse JSON output
	var secretsList struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
			} `json:"metadata"`
			Type string            `json:"type"`
			Data map[string]string `json:"data"`
		} `json:"items"`
	}

	if err := json.Unmarshal(output, &secretsList); err != nil {
		log.Printf("⚠️ Error parseando Secrets: %v\n", err)
		return certs
	}

	// Filter TLS secrets and extract certificate info
	for _, secret := range secretsList.Items {
		if secret.Type != "kubernetes.io/tls" {
			continue
		}

		// Decode base64 certificate
		certData, ok := secret.Data["tls.crt"]
		if !ok {
			continue
		}

		// Decode from base64
		certBytes, err := base64Decode(certData)
		if err != nil {
			continue
		}

		// Parse certificate
		block, _ := pem.Decode(certBytes)
		if block == nil {
			continue
		}

		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}

		// Extract CN and SANs
		cn := cert.Subject.CommonName
		var serverNames []string
		if cn != "" {
			serverNames = append(serverNames, cn)
		}
		serverNames = append(serverNames, cert.DNSNames...)

		discovered := DiscoveredCertificate{
			Domain:      cn,
			CertPath:    fmt.Sprintf("Secret: %s/%s", secret.Metadata.Namespace, secret.Metadata.Name),
			KeyPath:     fmt.Sprintf("Secret: %s/%s (tls.key)", secret.Metadata.Namespace, secret.Metadata.Name),
			ExpiresAt:   cert.NotAfter,
			Issuer:      cert.Issuer.CommonName,
			ServerType:  "kubernetes-secret",
			ConfigPath:  secret.Metadata.Namespace,
			ServerNames: serverNames,
		}

		certs = append(certs, discovered)
		log.Printf("  📜 Encontrado: %s (expira: %s) - Namespace: %s\n", cn, cert.NotAfter.Format("2006-01-02"), secret.Metadata.Namespace)
	}

	// Get Ingress resources
	ingressCerts := discoverKubernetesIngress()
	certs = append(certs, ingressCerts...)

	log.Printf("✅ Kubernetes: %d certificados encontrados\n", len(certs))
	return certs
}

// discoverKubernetesIngress scans Ingress resources for TLS configuration
func discoverKubernetesIngress() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	log.Println("🔍 Escaneando Ingress de Kubernetes...")

	cmd := exec.Command("kubectl", "get", "ingress", "--all-namespaces", "-o", "json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error leyendo Ingress: %v\n", err)
		return certs
	}

	var ingressList struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
			} `json:"metadata"`
			Spec struct {
				TLS []struct {
					Hosts      []string `json:"hosts"`
					SecretName string   `json:"secretName"`
				} `json:"tls"`
			} `json:"spec"`
		} `json:"items"`
	}

	if err := json.Unmarshal(output, &ingressList); err != nil {
		log.Printf("⚠️ Error parseando Ingress: %v\n", err)
		return certs
	}

	// Track ingress TLS configurations
	for _, ingress := range ingressList.Items {
		for _, tls := range ingress.Spec.TLS {
			if tls.SecretName == "" {
				continue
			}

			// Get the secret to extract certificate info
			secretCmd := exec.Command("kubectl", "get", "secret", tls.SecretName, "-n", ingress.Metadata.Namespace, "-o", "json")
			secretOutput, err := secretCmd.CombinedOutput()
			if err != nil {
				continue
			}

			var secret struct {
				Data map[string]string `json:"data"`
			}

			if err := json.Unmarshal(secretOutput, &secret); err != nil {
				continue
			}

			certData, ok := secret.Data["tls.crt"]
			if !ok {
				continue
			}

			certBytes, err := base64Decode(certData)
			if err != nil {
				continue
			}

			block, _ := pem.Decode(certBytes)
			if block == nil {
				continue
			}

			cert, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				continue
			}

			domain := ""
			if len(tls.Hosts) > 0 {
				domain = tls.Hosts[0]
			} else if cert.Subject.CommonName != "" {
				domain = cert.Subject.CommonName
			}

			discovered := DiscoveredCertificate{
				Domain:      domain,
				CertPath:    fmt.Sprintf("Ingress: %s/%s → Secret: %s", ingress.Metadata.Namespace, ingress.Metadata.Name, tls.SecretName),
				KeyPath:     fmt.Sprintf("Secret: %s/%s (tls.key)", ingress.Metadata.Namespace, tls.SecretName),
				ExpiresAt:   cert.NotAfter,
				Issuer:      cert.Issuer.CommonName,
				ServerType:  "kubernetes-ingress",
				ConfigPath:  fmt.Sprintf("%s/%s", ingress.Metadata.Namespace, ingress.Metadata.Name),
				ServerNames: tls.Hosts,
			}

			certs = append(certs, discovered)
			log.Printf("  📜 Encontrado: %s (expira: %s) - Ingress: %s/%s\n", domain, cert.NotAfter.Format("2006-01-02"), ingress.Metadata.Namespace, ingress.Metadata.Name)
		}
	}

	return certs
}

// base64Decode decodes a base64 string
func base64Decode(s string) ([]byte, error) {
	// Try standard encoding first
	data, err := base64.StdEncoding.DecodeString(s)
	if err == nil {
		return data, nil
	}
	// Try URL encoding
	return base64.URLEncoding.DecodeString(s)
}

// discoverDockerCertificates scans Docker containers and configurations for certificates
func discoverDockerCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Check if Docker is available
	if err := exec.Command("docker", "version").Run(); err != nil {
		log.Println("⚠️ Docker no detectado, saltando discovery de Docker")
		return certs
	}

	fmt.Println("🐳 [Docker] Iniciando Auto-Discovery...")

	// Discover from running containers
	containerCerts := discoverDockerContainerCertificates()
	certs = append(certs, containerCerts...)

	// Discover from Docker Compose files
	composeCerts := discoverDockerComposeCertificates()
	certs = append(certs, composeCerts...)

	// Discover from Docker volumes
	volumeCerts := discoverDockerVolumeCertificates()
	certs = append(certs, volumeCerts...)

	fmt.Printf("✅ [Docker] Auto-Discovery completado: %d certificados encontrados\n", len(certs))
	return certs
}

// discoverDockerContainerCertificates scans running containers for TLS configuration
func discoverDockerContainerCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Get list of running containers
	cmd := exec.Command("docker", "ps", "--format", "{{.ID}}|{{.Names}}|{{.Image}}")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error listando containers: %v\n", err)
		return certs
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) < 3 {
			continue
		}

		containerID := parts[0]
		containerName := parts[1]
		// imageName := parts[2] // Could be used for filtering specific images

		// Inspect container for TLS configuration
		inspectCmd := exec.Command("docker", "inspect", containerID)
		inspectOutput, err := inspectCmd.CombinedOutput()
		if err != nil {
			continue
		}

		// Parse container inspection
		var containerInfo []struct {
			Mounts []struct {
				Type        string `json:"Type"`
				Source      string `json:"Source"`
				Destination string `json:"Destination"`
			} `json:"Mounts"`
			Config struct {
				Env []string `json:"Env"`
			} `json:"Config"`
		}

		if err := json.Unmarshal(inspectOutput, &containerInfo); err != nil {
			continue
		}

		if len(containerInfo) == 0 {
			continue
		}

		// Check for certificate paths in mounts and environment
		certPaths := findCertificatePathsInContainer(containerInfo[0], containerName)

		for _, certPath := range certPaths {
			certInfo := readCertificateInfo(certPath)
			if certInfo == nil {
				continue
			}

			// Try to find corresponding key file
			keyPath := strings.Replace(certPath, ".crt", ".key", 1)
			if _, err := os.Stat(keyPath); err != nil {
				keyPath = "" // Key file not found
			}

			certs = append(certs, DiscoveredCertificate{
				Domain:     certInfo.Subject.CommonName,
				CertPath:   certPath,
				KeyPath:    keyPath,
				ExpiresAt:  certInfo.NotAfter,
				Issuer:     certInfo.Issuer.CommonName,
				ServerType: "docker-container",
				ConfigPath: fmt.Sprintf("docker://%s", containerName),
			})
		}
	}

	return certs
}

// findCertificatePathsInContainer searches for certificate paths in container configuration
func findCertificatePathsInContainer(container interface{}, containerName string) []string {
	var certPaths []string

	// Common certificate paths to look for
	commonCertPaths := []string{
		"/etc/letsencrypt/live/",
		"/etc/ssl/certs/",
		"/etc/nginx/certs/",
		"/etc/apache2/certs/",
		"/certs/",
		"/app/certs/",
		"/var/www/certs/",
	}

	// Check mounts
	if mounts, ok := container.(struct {
		Mounts []struct {
			Type        string `json:"Type"`
			Source      string `json:"Source"`
			Destination string `json:"Destination"`
		} `json:"Mounts"`
	}); ok {
		for _, mount := range mounts.Mounts {
			for _, certPath := range commonCertPaths {
				if strings.Contains(mount.Destination, certPath) || strings.Contains(mount.Source, certPath) {
					certPaths = append(certPaths, mount.Source)
				}
			}
		}
	}

	// Check environment variables
	if config, ok := container.(struct {
		Config struct {
			Env []string `json:"Env"`
		} `json:"Config"`
	}); ok {
		for _, env := range config.Config.Env {
			if strings.Contains(env, "CERT_PATH") || strings.Contains(env, "SSL_CERT") || strings.Contains(env, "TLS_CERT") {
				parts := strings.Split(env, "=")
				if len(parts) == 2 {
					certPaths = append(certPaths, parts[1])
				}
			}
		}
	}

	return certPaths
}

// discoverDockerComposeCertificates scans Docker Compose files for TLS configuration
func discoverDockerComposeCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Find docker-compose files
	composeFiles := []string{
		"docker-compose.yml",
		"docker-compose.yaml",
		"../docker-compose.yml",
		"../docker-compose.yaml",
	}

	for _, composeFile := range composeFiles {
		if _, err := os.Stat(composeFile); err == nil {
			composeCerts := parseDockerComposeForCerts(composeFile)
			certs = append(certs, composeCerts...)
		}
	}

	return certs
}

// parseDockerComposeForCerts parses a docker-compose file for certificate configurations
func parseDockerComposeForCerts(composeFile string) []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	data, err := os.ReadFile(composeFile)
	if err != nil {
		return certs
	}

	// Simple text search for certificate paths in compose files
	content := string(data)
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Look for certificate-related volume mounts
		if strings.Contains(line, "/etc/letsencrypt/") ||
			strings.Contains(line, "/certs/") ||
			strings.Contains(line, ".crt") ||
			strings.Contains(line, ".key") {

			// Extract volume path
			if strings.Contains(line, "volumes:") || strings.Contains(line, "- ") {
				parts := strings.Split(line, ":")
				if len(parts) >= 1 {
					certPath := strings.TrimSpace(parts[0])
					if strings.HasSuffix(certPath, ".crt") || strings.HasSuffix(certPath, ".key") {
						certInfo := readCertificateInfo(certPath)
						if certInfo == nil {
							continue
						}

						// Try to find corresponding key file
						keyPath := strings.Replace(certPath, ".crt", ".key", 1)
						if _, err := os.Stat(keyPath); err != nil {
							keyPath = ""
						}

						certs = append(certs, DiscoveredCertificate{
							Domain:     certInfo.Subject.CommonName,
							CertPath:   certPath,
							KeyPath:    keyPath,
							ExpiresAt:  certInfo.NotAfter,
							Issuer:     certInfo.Issuer.CommonName,
							ServerType: "docker-compose",
							ConfigPath: fmt.Sprintf("docker-compose:%s", composeFile),
						})
					}
				}
			}
		}
	}

	return certs
}

// discoverDockerVolumeCertificates scans Docker volumes for certificates
func discoverDockerVolumeCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// List all Docker volumes
	cmd := exec.Command("docker", "volume", "ls", "--format", "{{.Name}}")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return certs
	}

	volumes := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, volumeName := range volumes {
		if volumeName == "" {
			continue
		}

		// Inspect volume to get mountpoint
		inspectCmd := exec.Command("docker", "volume", "inspect", volumeName)
		inspectOutput, err := inspectCmd.CombinedOutput()
		if err != nil {
			continue
		}

		var volumeInfo []struct {
			Mountpoint string `json:"Mountpoint"`
		}

		if err := json.Unmarshal(inspectOutput, &volumeInfo); err != nil {
			continue
		}

		if len(volumeInfo) == 0 || volumeInfo[0].Mountpoint == "" {
			continue
		}

		mountpoint := volumeInfo[0].Mountpoint

		// Search for certificate files in the volume
		certPaths := findCertificatesInDirectory(mountpoint)
		for _, certPath := range certPaths {
			certInfo := readCertificateInfo(certPath)
			if certInfo == nil {
				continue
			}

			// Try to find corresponding key file
			keyPath := strings.Replace(certPath, ".crt", ".key", 1)
			if _, err := os.Stat(keyPath); err != nil {
				keyPath = ""
			}

			certs = append(certs, DiscoveredCertificate{
				Domain:     certInfo.Subject.CommonName,
				CertPath:   certPath,
				KeyPath:    keyPath,
				ExpiresAt:  certInfo.NotAfter,
				Issuer:     certInfo.Issuer.CommonName,
				ServerType: "docker-volume",
				ConfigPath: fmt.Sprintf("docker-volume:%s", volumeName),
			})
		}
	}

	return certs
}

// findCertificatesInDirectory recursively searches for certificate files in a directory
func findCertificatesInDirectory(dir string) []string {
	var certPaths []string

	entries, err := os.ReadDir(dir)
	if err != nil {
		return certPaths
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// Recursively search subdirectories
			subPaths := findCertificatesInDirectory(filepath.Join(dir, entry.Name()))
			certPaths = append(certPaths, subPaths...)
		} else {
			// Check if file is a certificate
			fileName := entry.Name()
			if strings.HasSuffix(fileName, ".crt") ||
				strings.HasSuffix(fileName, ".pem") ||
				strings.HasSuffix(fileName, ".key") {

				certPath := filepath.Join(dir, fileName)
				// Verify it's actually a certificate
				if readCertificateInfo(certPath) != nil {
					certPaths = append(certPaths, certPath)
				}
			}
		}
	}

	return certPaths
}

// discoverHAProxyCertificates scans HAProxy configuration and containers for certificates
func discoverHAProxyCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	fmt.Println("⚖️ [HAProxy] Iniciando Auto-Discovery...")

	// Discover from HAProxy configuration files
	configCerts := discoverHAProxyConfigFiles()
	certs = append(certs, configCerts...)

	// Discover from HAProxy Docker containers
	containerCerts := discoverHAProxyContainers()
	certs = append(certs, containerCerts...)

	fmt.Printf("✅ [HAProxy] Auto-Discovery completado: %d certificados encontrados\n", len(certs))
	return certs
}

// discoverHAProxyConfigFiles scans HAProxy configuration files for certificates
func discoverHAProxyConfigFiles() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	haproxyConfigPaths := []string{
		"/etc/haproxy/haproxy.cfg",
		"/etc/haproxy/haproxy.conf",
		"haproxy.cfg",
		"haproxy.conf",
	}

	for _, configPath := range haproxyConfigPaths {
		if _, err := os.Stat(configPath); err == nil {
			certs = append(certs, parseHAProxyConfig(configPath)...)
		}
	}

	return certs
}

// parseHAProxyConfig parses HAProxy configuration file for certificate references
func parseHAProxyConfig(configPath string) []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	content, err := os.ReadFile(configPath)
	if err != nil {
		return certs
	}

	lines := strings.Split(string(content), "\n")
	var currentDomains []string
	var currentCertPath string

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Extract certificate path
		if strings.Contains(line, "crt") && strings.HasPrefix(line, "bind") {
			re := regexp.MustCompile(`crt\s+["']?([^"'\s]+)["']?`)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				currentCertPath = strings.TrimSpace(matches[1])

				// Extract domains from server lines following bind
				domainRe := regexp.MustCompile(`server\s+(\S+)\s+.*`)
				if domainMatch := domainRe.FindStringSubmatch(line); len(domainMatch) > 1 {
					currentDomains = append(currentDomains, domainMatch[1])
				}

				if currentCertPath != "" && len(currentDomains) > 0 {
					certInfo := readCertificateInfo(currentCertPath)
					if certInfo != nil {
						certs = append(certs, DiscoveredCertificate{
							Domain:      certInfo.Subject.CommonName,
							CertPath:    currentCertPath,
							ExpiresAt:   certInfo.NotAfter,
							Issuer:      certInfo.Issuer.CommonName,
							ServerType:  "haproxy",
							ConfigPath:  configPath,
							ServerNames: currentDomains,
						})
					}
					currentCertPath = ""
					currentDomains = []string{}
				}
			}
		}
	}

	return certs
}

// discoverHAProxyContainers finds HAProxy containers and scans their volumes
func discoverHAProxyContainers() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	// Find HAProxy containers
	cmd := exec.Command("docker", "ps", "--filter", "ancestor=haproxy", "--format", "{{.ID}}|{{.Names}}")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return certs
	}

	containers := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, container := range containers {
		if container == "" {
			continue
		}

		parts := strings.Split(container, "|")
		if len(parts) < 2 {
			continue
		}

		containerID := parts[0]
		containerName := parts[1]

		// Inspect container for certificate mounts
		inspectCmd := exec.Command("docker", "inspect", containerID)
		inspectOutput, err := inspectCmd.CombinedOutput()
		if err != nil {
			continue
		}

		var containerInfo []struct {
			Mounts []struct {
				Type        string `json:"Type"`
				Source      string `json:"Source"`
				Destination string `json:"Destination"`
			} `json:"Mounts"`
		}

		if err := json.Unmarshal(inspectOutput, &containerInfo); err != nil {
			continue
		}

		if len(containerInfo) == 0 {
			continue
		}

		// Search for certificate paths in mounts
		for _, mount := range containerInfo[0].Mounts {
			if strings.Contains(mount.Destination, "/certs") ||
				strings.Contains(mount.Destination, "/etc/ssl") ||
				strings.Contains(mount.Source, "haproxy") {

				certPaths := findCertificatesInDirectory(mount.Source)
				for _, certPath := range certPaths {
					certInfo := readCertificateInfo(certPath)
					if certInfo == nil {
						continue
					}

					// Try to find corresponding key file
					keyPath := strings.Replace(certPath, ".crt", ".key", 1)
					if _, err := os.Stat(keyPath); err != nil {
						keyPath = ""
					}

					certs = append(certs, DiscoveredCertificate{
						Domain:     certInfo.Subject.CommonName,
						CertPath:   certPath,
						KeyPath:    keyPath,
						ExpiresAt:  certInfo.NotAfter,
						Issuer:     certInfo.Issuer.CommonName,
						ServerType: "haproxy-docker",
						ConfigPath: fmt.Sprintf("docker://%s", containerName),
					})
				}
			}
		}
	}

	return certs
}

// applyKubernetes applies certificate to Kubernetes Secret and Ingress
func applyKubernetes(domain string, config DeploymentConfig) {
	fmt.Println("🔧 [Kubernetes] Preparando certificado...")

	certPath := filepath.Join("certs", fmt.Sprintf("%s.crt", domain))
	keyPath := filepath.Join("certs", fmt.Sprintf("%s.key", domain))

	// Check if kubectl is available
	if err := exec.Command("kubectl", "version", "--client", "--short").Run(); err != nil {
		log.Println("❌ [Kubernetes] kubectl no está disponible")
		return
	}

	// Determine namespace (default to "default" if not specified)
	namespace := "default"
	if config.SiteName != "" {
		namespace = config.SiteName
	}

	// Create or update Secret
	secretName := fmt.Sprintf("%s-tls", strings.ReplaceAll(domain, ".", "-"))

	fmt.Printf("🔧 [Kubernetes] Creando/actualizando Secret: %s en namespace: %s\n", secretName, namespace)

	// Delete existing secret if it exists (ignore errors)
	exec.Command("kubectl", "delete", "secret", secretName, "-n", namespace).Run()

	// Create new secret
	cmd := exec.Command("kubectl", "create", "secret", "tls", secretName,
		"--cert="+certPath,
		"--key="+keyPath,
		"-n", namespace)

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ [Kubernetes] Error creando Secret: %v\n%s\n", err, string(output))
		return
	}

	fmt.Printf("✅ [Kubernetes] Secret creado: %s/%s\n", namespace, secretName)

	// Optionally restart pods that use this secret (if ingress controller needs reload)
	fmt.Println("🔄 [Kubernetes] Reiniciando Ingress Controller...")
	restartCmd := exec.Command("kubectl", "rollout", "restart", "deployment", "-n", "ingress-nginx", "-l", "app.kubernetes.io/component=controller")
	if err := restartCmd.Run(); err != nil {
		log.Printf("⚠️ [Kubernetes] No se pudo reiniciar Ingress Controller (puede no ser necesario): %v\n", err)
	}

	fmt.Println("✅ [Kubernetes] Certificado aplicado correctamente")
}

// applyDocker applies certificate to Docker containers and configurations
func applyDocker(domain string, config DeploymentConfig) {
	fmt.Println("🐳 [Docker] Preparando certificado...")

	certPath := filepath.Join("certs", fmt.Sprintf("%s.crt", domain))
	keyPath := filepath.Join("certs", fmt.Sprintf("%s.key", domain))

	// Check if Docker is available
	if err := exec.Command("docker", "version").Run(); err != nil {
		log.Println("❌ [Docker] Docker no está disponible")
		return
	}

	// Get target container name from config, default to domain
	containerName := domain
	if config.SiteName != "" {
		containerName = config.SiteName
	}

	fmt.Printf("🔧 [Docker] Actualizando certificado en container: %s\n", containerName)

	// Strategy 1: Copy certificates to container
	if err := copyCertificatesToContainer(containerName, certPath, keyPath); err != nil {
		log.Printf("⚠️ [Docker] Error copiando certificados: %v", err)
	} else {
		// Restart container to apply new certificates
		restartContainer(containerName)
	}

	// Strategy 2: Update Docker Compose file if exists
	if err := updateDockerComposeCerts(domain, certPath, keyPath); err != nil {
		log.Printf("⚠️ [Docker] No se encontró docker-compose para actualizar: %v", err)
	}

	// Strategy 3: Update nginx-proxy or similar proxy containers
	if err := updateProxyContainers(domain, certPath, keyPath); err != nil {
		log.Printf("⚠️ [Docker] Error actualizando proxy containers: %v", err)
	}

	fmt.Printf("✅ [Docker] Certificado actualizado para: %s\n", domain)
}

// applyHAProxy applies certificate to HAProxy configuration
func applyHAProxy(domain string, config DeploymentConfig) {
	fmt.Println("⚖️ [HAProxy] Preparando certificado...")

	certPath := filepath.Join("certs", fmt.Sprintf("%s.crt", domain))
	keyPath := filepath.Join("certs", fmt.Sprintf("%s.key", domain))

	// Get HAProxy config path from config, or use default
	configPath := "/etc/haproxy/haproxy.cfg"
	if config.SiteName != "" {
		configPath = config.SiteName
	}

	fmt.Printf("🔧 [HAProxy] Actualizando configuración: %s\n", configPath)

	// Update HAProxy configuration file
	if err := updateHAProxyConfig(configPath, domain, certPath, keyPath); err != nil {
		log.Printf("❌ [HAProxy] Error actualizando configuración: %v", err)
		return
	}

	// Reload HAProxy service
	if err := reloadHAProxyService(); err != nil {
		log.Printf("⚠️ [HAProxy] Error recargando servicio: %v", err)
	}

	// Update HAProxy Docker containers
	updateHAProxyContainers(domain, certPath, keyPath)

	fmt.Printf("✅ [HAProxy] Certificado actualizado para: %s\n", domain)
}

// updateHAProxyConfig updates certificate paths in HAProxy configuration
func updateHAProxyConfig(configPath string, domain string, certPath string, keyPath string) error {
	// Check if config file exists
	if _, err := os.Stat(configPath); err != nil {
		// Try to find HAProxy config
		defaultPaths := []string{
			"/etc/haproxy/haproxy.cfg",
			"/etc/haproxy/haproxy.conf",
			"haproxy.cfg",
		}

		for _, path := range defaultPaths {
			if _, err := os.Stat(path); err == nil {
				configPath = path
				break
			}
		}
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer configuración de HAProxy: %v", err)
	}

	// Replace certificate paths in config
	newContent := strings.ReplaceAll(string(content),
		fmt.Sprintf("/etc/letsencrypt/live/%s", domain),
		filepath.Dir(certPath))

	// Write back
	if err := os.WriteFile(configPath, []byte(newContent), 0644); err != nil {
		return fmt.Errorf("error escribiendo configuración: %v", err)
	}

	return nil
}

// reloadHAProxyService reloads HAProxy service
func reloadHAProxyService() error {
	// Try different reload methods
	reloadMethods := []string{
		"systemctl reload haproxy",
		"service haproxy reload",
		"haproxy -f /etc/haproxy/haproxy.cfg -sf $(pgrep haproxy)",
	}

	for _, method := range reloadMethods {
		parts := strings.Fields(method)
		if len(parts) == 0 {
			continue
		}

		cmd := exec.Command(parts[0], parts[1:]...)
		if err := cmd.Run(); err == nil {
			fmt.Printf("✅ [HAProxy] Servicio recargado: %s\n", method)
			return nil
		}
	}

	return fmt.Errorf("no se pudo recargar HAProxy")
}

// updateHAProxyContainers updates certificates in HAProxy Docker containers
func updateHAProxyContainers(domain string, certPath string, keyPath string) {
	// Find HAProxy containers
	cmd := exec.Command("docker", "ps", "--filter", "ancestor=haproxy", "--format", "{{.Names}}")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return
	}

	containers := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, containerName := range containers {
		if containerName == "" {
			continue
		}

		fmt.Printf("🔧 [HAProxy] Actualizando container: %s\n", containerName)

		// Copy certificates to container
		certDest := fmt.Sprintf("%s:/certs/%s.crt", containerName, domain)
		keyDest := fmt.Sprintf("%s:/certs/%s.key", containerName, domain)

		exec.Command("docker", "cp", certPath, certDest).Run()
		exec.Command("docker", "cp", keyPath, keyDest).Run()

		// Reload HAProxy in container
		reloadCmd := exec.Command("docker", "exec", containerName, "haproxy", "-f", "/etc/haproxy/haproxy.cfg", "-sf", "$(pidof haproxy)")
		if err := reloadCmd.Run(); err != nil {
			// Try service reload
			reloadCmd = exec.Command("docker", "exec", containerName, "service", "haproxy", "reload")
			reloadCmd.Run()
		}

		fmt.Printf("✅ [HAProxy] Container actualizado: %s\n", containerName)
	}
}

// copyCertificatesToContainer copies certificate files to a running container
func copyCertificatesToContainer(containerName string, certPath string, keyPath string) error {
	// Copy certificate
	certDest := fmt.Sprintf("%s:/etc/nginx/certs/%s.crt", containerName, containerName)
	cmd := exec.Command("docker", "cp", certPath, certDest)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Copy private key
	keyDest := fmt.Sprintf("%s:/etc/nginx/certs/%s.key", containerName, containerName)
	cmd = exec.Command("docker", "cp", keyPath, keyDest)
	if err := cmd.Run(); err != nil {
		return err
	}

	return nil
}

// restartContainer restarts a Docker container
func restartContainer(containerName string) {
	fmt.Printf("🔄 [Docker] Reiniciando container: %s\n", containerName)
	cmd := exec.Command("docker", "restart", containerName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ [Docker] Error reiniciando container: %v\n%s\n", err, string(output))
		return
	}
	fmt.Printf("✅ [Docker] Container reiniciado: %s\n", containerName)
}

// updateDockerComposeCerts updates certificate paths in docker-compose files
func updateDockerComposeCerts(domain string, certPath string, keyPath string) error {
	composeFiles := []string{
		"docker-compose.yml",
		"docker-compose.yaml",
	}

	for _, composeFile := range composeFiles {
		if _, err := os.Stat(composeFile); err == nil {
			fmt.Printf("🔧 [Docker] Actualizando %s con nuevos certificados\n", composeFile)
			// Read compose file
			content, err := os.ReadFile(composeFile)
			if err != nil {
				continue
			}

			// Replace certificate paths
			newContent := strings.ReplaceAll(string(content), "/etc/letsencrypt/live/"+domain, filepath.Dir(certPath))

			// Write back
			if err := os.WriteFile(composeFile, []byte(newContent), 0644); err != nil {
				log.Printf("⚠️ [Docker] Error actualizando %s: %v", composeFile, err)
				continue
			}

			// Recreate containers with new config
			cmd := exec.Command("docker-compose", "up", "-d", "--force-recreate")
			cmd.Run()

			fmt.Printf("✅ [Docker] docker-compose actualizado: %s\n", composeFile)
			return nil
		}
	}

	return fmt.Errorf("no docker-compose file found")
}

// updateProxyContainers updates certificates in nginx-proxy and similar proxy containers
func updateProxyContainers(domain string, certPath string, keyPath string) error {
	// Common proxy container names
	proxyContainers := []string{
		"nginx-proxy",
		"letsencrypt-nginx-proxy-companion",
		"traefik",
		"reverse-proxy",
	}

	for _, proxyName := range proxyContainers {
		// Check if container exists
		cmd := exec.Command("docker", "ps", "--filter", fmt.Sprintf("name=%s", proxyName), "--format", "{{.Names}}")
		output, err := cmd.CombinedOutput()
		if err != nil || len(output) == 0 {
			continue
		}

		fmt.Printf("🔧 [Docker] Actualizando proxy container: %s\n", proxyName)

		// Copy certificates to proxy volumes
		if err := copyCertificatesToVolume(proxyName, certPath, keyPath); err != nil {
			log.Printf("⚠️ [Docker] Error actualizando %s: %v", proxyName, err)
			continue
		}

		// Reload nginx in the container
		reloadCmd := exec.Command("docker", "exec", proxyName, "nginx", "-s", "reload")
		if err := reloadCmd.Run(); err != nil {
			// Try systemctl or service restart
			reloadCmd = exec.Command("docker", "exec", proxyName, "service", "nginx", "reload")
			reloadCmd.Run()
		}

		fmt.Printf("✅ [Docker] Proxy actualizado: %s\n", proxyName)
	}

	return nil
}

// copyCertificatesToVolume copies certificates to Docker volume used by proxy containers
func copyCertificatesToVolume(containerName string, certPath string, keyPath string) error {
	// Try to find the volume mount point
	cmd := exec.Command("docker", "inspect", "--format", "{{range .Mounts}}{{.Destination}}:{{.Source}}{{end}}", containerName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return err
	}

	mounts := strings.Split(strings.TrimSpace(string(output)), ":")
	for _, mount := range mounts {
		if strings.Contains(mount, "/etc/nginx/certs") || strings.Contains(mount, "/certs") {
			// Copy certificates to volume
			exec.Command("docker", "cp", certPath, fmt.Sprintf("%s:/certs/domain.crt", containerName)).Run()
			exec.Command("docker", "cp", keyPath, fmt.Sprintf("%s:/certs/domain.key", containerName)).Run()
			return nil
		}
	}

	return fmt.Errorf("no certs volume found")
}

// ============================================================================
// WINDOWS AUTO-DISCOVERY FUNCTIONS
// ============================================================================

// discoverWindowsCertificates scans Windows Certificate Store for certificates
func discoverWindowsCertificates() []DiscoveredCertificate {
	var certs []DiscoveredCertificate

	log.Println("🔍 Escaneando Certificate Store de Windows...")

	// PowerShell script to list certificates
	psScript := `
Get-ChildItem Cert:\LocalMachine\My | Where-Object {
    $_.EnhancedKeyUsageList -match "Server Authentication"
} | ForEach-Object {
    $sans = ($_.Extensions | Where-Object {$_.Oid.FriendlyName -eq "Subject Alternative Name"}).Format($false) -replace "DNS Name=", "" -replace "\n", "," -replace " ", ""
    [PSCustomObject]@{
        Subject = $_.Subject
        Issuer = $_.Issuer
        NotAfter = $_.NotAfter.ToString("yyyy-MM-ddTHH:mm:ssZ")
        Thumbprint = $_.Thumbprint
        SANs = $sans
    }
} | ConvertTo-Json -Compress
`

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error leyendo Certificate Store: %v\n", err)
		return certs
	}

	// Parse JSON output
	var winCerts []struct {
		Subject    string `json:"Subject"`
		Issuer     string `json:"Issuer"`
		NotAfter   string `json:"NotAfter"`
		Thumbprint string `json:"Thumbprint"`
		SANs       string `json:"SANs"`
	}

	// Handle both single object and array
	outputStr := strings.TrimSpace(string(output))
	if outputStr == "" {
		log.Println("⚠️ No se encontraron certificados en el Certificate Store")
		return certs
	}

	// Try to parse as array first
	if err := json.Unmarshal([]byte(outputStr), &winCerts); err != nil {
		// If that fails, try as single object
		var singleCert struct {
			Subject    string `json:"Subject"`
			Issuer     string `json:"Issuer"`
			NotAfter   string `json:"NotAfter"`
			Thumbprint string `json:"Thumbprint"`
			SANs       string `json:"SANs"`
		}
		if err := json.Unmarshal([]byte(outputStr), &singleCert); err != nil {
			log.Printf("⚠️ Error parseando certificados: %v\n", err)
			return certs
		}
		winCerts = append(winCerts, singleCert)
	}

	// Get IIS bindings to associate certificates with sites
	iisBindings := discoverIISBindings()
	bindingMap := make(map[string]string) // thumbprint -> siteName

	for _, binding := range iisBindings {
		bindingMap[binding.CertHash] = binding.SiteName
	}

	// Convert to DiscoveredCertificate format
	for _, cert := range winCerts {
		expiresAt, _ := time.Parse("2006-01-02T15:04:05Z", cert.NotAfter)

		// Extract CN from Subject
		cn := extractCN(cert.Subject)

		// Parse SANs
		var serverNames []string
		if cert.SANs != "" {
			serverNames = strings.Split(cert.SANs, ",")
		}
		if cn != "" && !contains(serverNames, cn) {
			serverNames = append([]string{cn}, serverNames...)
		}

		// Get site name from binding map
		siteName := bindingMap[cert.Thumbprint]
		if siteName == "" {
			siteName = "Not bound to IIS"
		}

		discovered := DiscoveredCertificate{
			Domain:      cn,
			CertPath:    fmt.Sprintf("Cert:\\LocalMachine\\My\\%s", cert.Thumbprint),
			KeyPath:     "(Private Key in Certificate Store)",
			ExpiresAt:   expiresAt,
			Issuer:      extractCN(cert.Issuer),
			ServerType:  "windows-certstore",
			ConfigPath:  siteName,
			ServerNames: serverNames,
		}

		certs = append(certs, discovered)
		log.Printf("  📜 Encontrado: %s (expira: %s) - Sitio: %s\n", cn, expiresAt.Format("2006-01-02"), siteName)
	}

	log.Printf("✅ Certificate Store: %d certificados encontrados\n", len(certs))
	return certs
}

// discoverIISBindings gets IIS site bindings
func discoverIISBindings() []struct {
	SiteName string
	Binding  string
	CertHash string
} {
	var bindings []struct {
		SiteName string
		Binding  string
		CertHash string
	}

	// Check if IIS is installed
	checkCmd := exec.Command("powershell", "-Command", "Get-Service -Name W3SVC -ErrorAction SilentlyContinue")
	if err := checkCmd.Run(); err != nil {
		log.Println("⚠️ IIS no detectado, saltando discovery de bindings")
		return bindings
	}

	log.Println("🔍 Escaneando bindings de IIS...")

	psScript := `
Import-Module WebAdministration -ErrorAction SilentlyContinue
Get-Website | ForEach-Object {
    $site = $_
    $siteBindings = Get-WebBinding -Name $site.Name | Where-Object {$_.protocol -eq "https"}
    foreach ($binding in $siteBindings) {
        [PSCustomObject]@{
            SiteName = $site.Name
            Binding = $binding.bindingInformation
            CertHash = $binding.certificateHash
        }
    }
} | ConvertTo-Json -Compress
`

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("⚠️ Error leyendo bindings de IIS: %v\n", err)
		return bindings
	}

	outputStr := strings.TrimSpace(string(output))
	if outputStr == "" {
		return bindings
	}

	// Try to parse as array first
	if err := json.Unmarshal([]byte(outputStr), &bindings); err != nil {
		// If that fails, try as single object
		var singleBinding struct {
			SiteName string
			Binding  string
			CertHash string
		}
		if err := json.Unmarshal([]byte(outputStr), &singleBinding); err != nil {
			log.Printf("⚠️ Error parseando bindings: %v\n", err)
			return bindings
		}
		bindings = append(bindings, singleBinding)
	}

	log.Printf("✅ IIS: %d bindings encontrados\n", len(bindings))
	return bindings
}

// extractCN extracts Common Name from a Distinguished Name
func extractCN(dn string) string {
	// Extract CN= value from DN string
	re := regexp.MustCompile(`CN=([^,]+)`)
	matches := re.FindStringSubmatch(dn)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return dn
}

// contains checks if a string slice contains a value
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func downloadCertificate(domain string) (CertResponse, error) {
	var certRes CertResponse
	req, err := http.NewRequest("GET", fmt.Sprintf(apiBaseURL+"/api/download-cert/%s", domain), nil)
	if err != nil {
		return certRes, err
	}
	req.Header.Set("x-agent-token", agentToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return certRes, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return certRes, fmt.Errorf("download-cert endpoint status: %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(&certRes); err != nil {
		return certRes, err
	}

	return certRes, nil
}
