FROM ubuntu:22.04

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    autoconf \
    automake \
    autotools-dev \
    bc \
    build-essential \
    curl \
    dc \
    dnsutils \
    fping \
    gettext \
    git \
    gzip \
    iputils-ping \
    libc6 \
    libgd-dev \
    libmcrypt-dev \
    libnet-snmp-perl \
    libssl-dev \
    mailutils \
    netcat \
    openssh-client \
    openssh-server \
    perl \
    procps \
    sudo \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create nagios user and group
RUN groupadd -r nagios && useradd -r -g nagios nagios && usermod -aG sudo nagios

# Download and compile Nagios Core
WORKDIR /tmp
RUN wget -q https://github.com/NagiosEnterprises/nagioscore/archive/nagios-4.5.0.tar.gz && \
    tar xzf nagios-4.5.0.tar.gz && \
    cd nagioscore-nagios-4.5.0 && \
    ./configure --prefix=/usr/local/nagios \
                --exec-prefix=/usr/local/nagios \
                --localstatedir=/var/nagios \
                --sysconfdir=/etc/nagios \
                --enable-event-broker \
                --enable-nanosleep \
                --enable-embedded-perl \
                --with-perlcache \
                --with-perl=/usr/bin/perl && \
    make all && \
    make install && \
    make install-init && \
    make install-config && \
    make install-commandmode

# Download and compile Nagios Plugins
WORKDIR /tmp
RUN wget -q https://github.com/nagios-plugins/nagios-plugins/archive/release-2.4.6.tar.gz && \
    tar xzf release-2.4.6.tar.gz && \
    cd nagios-plugins-release-2.4.6 && \
    ./tools/setup && \
    ./configure --prefix=/usr/local/nagios \
                --with-nagios-user=nagios \
                --with-nagios-group=nagios && \
    make && \
    make install

# Create Nagios web directory
RUN mkdir -p /usr/local/nagios/share && \
    chown -R nagios:nagios /usr/local/nagios

# Keep Nagios daemonized and let Apache stay in the foreground for the container
RUN sed -i 's/daemon_mode=0/daemon_mode=1/' /etc/nagios/nagios.cfg || true

# Copy custom configuration files
COPY config/ /etc/nagios/
RUN chown -R nagios:nagios /etc/nagios && chmod -R 755 /etc/nagios

# Copy custom plugins
COPY plugins/ /usr/local/nagios/libexec/custom/
RUN find /usr/local/nagios/libexec/custom -type f -exec chmod +x {} +

# Create directories for Nagios
RUN mkdir -p /var/nagios /var/log/nagios && \
    chown -R nagios:nagios /var/nagios /var/log/nagios

# Install and configure Apache/PHP for web UI (optional but useful)
RUN apt-get update && apt-get install -y \
    apache2 \
    apache2-utils \
    php \
    php-gd \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite && a2enmod cgi

# Create Apache configuration for Nagios
COPY <<EOF /etc/apache2/sites-available/nagios.conf
<VirtualHost *:80>
    ServerName localhost
    DocumentRoot /usr/local/nagios/share

    ScriptAlias /nagios/cgi-bin /usr/local/nagios/sbin
    Alias /nagios /usr/local/nagios/share

    <Directory /usr/local/nagios/sbin>
        Options +ExecCGI +FollowSymLinks
        AllowOverride None
        <RequireAll>
            Require all granted
        </RequireAll>
    </Directory>

    <Directory /usr/local/nagios/share>
        Options None
        AllowOverride None
        <RequireAll>
            Require all granted
        </RequireAll>
    </Directory>
</VirtualHost>
EOF

RUN a2dissite 000-default && a2ensite nagios

# Set permissions
RUN chown -R nagios:nagios /usr/local/nagios && \
    chmod -R 775 /var/nagios && \
    chmod -R 775 /var/log/nagios

# Expose ports
EXPOSE 80

# Start Nagios, then keep Apache in the foreground for the web UI and healthcheck
CMD ["/bin/sh", "-c", "sudo -u nagios /usr/local/nagios/bin/nagios -d /etc/nagios/nagios.cfg && exec apache2ctl -D FOREGROUND"]
