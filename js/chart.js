let pieChart;
let animationFrameId;
let gradientOffset = 0;

const charts = {
    renderDailyPie(sessions, baseDateStr) {
        const canvas = document.getElementById('daily-pie-chart');
        const ctx = canvas.getContext('2d');
        
        const targetDateStr = baseDateStr || new Date().toLocaleDateString('en-CA');
        const dayStart = new Date(targetDateStr + 'T00:00:00').getTime();
        const dayEnd = new Date(targetDateStr + 'T23:59:59.999').getTime();

        const dataValues = [];
        const backgroundColors = [];
        const labels = [];
        const tooltipLabels = [];
        const sessionStatus = []; // 각 조각의 active 여부 저장

        let currentTime = dayStart;

        // 세션을 시작 시간 순으로 정렬
        const sortedSessions = (sessions || []).sort((a, b) => new Date(a.start) - new Date(b.start));

        sortedSessions.forEach(session => {
            const start = new Date(session.start).getTime();
            const end = new Date(session.end).getTime();

            // 빈 시간 조각 (이전 세션 끝 ~ 현재 세션 시작)
            if (start > currentTime) {
                const emptyMins = (start - currentTime) / 60000;
                dataValues.push(emptyMins);
                backgroundColors.push('rgba(233, 236, 239, 0.2)');
                labels.push('빈 시간');
                tooltipLabels.push('');
                sessionStatus.push({ active: false, color: 'rgba(233, 236, 239, 0.2)' });
            }

            // 공부 세션 조각
            const studyMins = (end - start) / 60000;
            if (studyMins > 0) {
                dataValues.push(studyMins);
                backgroundColors.push(session.color);
                labels.push(session.is_active ? `${session.subject_name} (Active)` : session.subject_name);
                tooltipLabels.push(`${session.subject_name}: ${Math.floor(studyMins)}분${session.is_active ? ' (진행중)' : ''}`);
                sessionStatus.push({ active: session.is_active, color: session.color });
            }

            currentTime = end;
        });

        // 마지막 세션 이후 남은 빈 시간 조각
        if (currentTime < dayEnd) {
            const remainingMins = (dayEnd - currentTime) / 60000;
            dataValues.push(remainingMins);
            backgroundColors.push('rgba(233, 236, 239, 0.2)');
            labels.push('빈 시간');
            tooltipLabels.push('');
            sessionStatus.push({ active: false, color: 'rgba(233, 236, 239, 0.2)' });
        }

        // 시계 문자판 플러그인
        const clockLabelsPlugin = {
            id: 'clockLabels',
            afterDraw(chart) {
                const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
                const centerX = left + width / 2;
                const centerY = top + height / 2;
                const meta = chart.getDatasetMeta(0);
                if (!meta.data || meta.data.length === 0) return;
                
                const outerRadius = meta.data[0].outerRadius; 
                const radius = outerRadius + 15; // 파이 바깥쪽
                
                ctx.save();
                ctx.font = '11px sans-serif';
                ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-color') || '#666';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                for (let i = 0; i < 24; i++) {
                    const angle = (i * 15 - 90) * Math.PI / 180;
                    const x = centerX + radius * Math.cos(angle);
                    const y = centerY + radius * Math.sin(angle);
                    
                    let label = '';
                    if (i === 0) label = '0A';
                    else if (i < 12) label = `${i}A`;
                    else if (i === 12) label = 'MD';
                    else label = `${i - 12}P`;
                    
                    ctx.fillText(label, x, y);
                }
                ctx.restore();
            }
        };

        // Active 세션 그라데이션 애니메이션 플러그인
        const activeGradientPlugin = {
            id: 'activeGradient',
            beforeDatasetDraw(chart, args) {
                const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
                const meta = args.meta;
                
                meta.data.forEach((element, index) => {
                    const status = sessionStatus[index];
                    if (status && status.active) {
                        const centerX = (left + right) / 2;
                        const centerY = (top + bottom) / 2;
                        
                        // 동적 콘익 그라데이션 생성 (시계 방향으로 빛이 흐르는 느낌)
                        const grad = ctx.createConicGradient(gradientOffset, centerX, centerY);
                        
                        const baseColor = status.color;
                        grad.addColorStop(0, baseColor);
                        grad.addColorStop(0.45, baseColor);
                        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)'); // 부드러운 하이라이트
                        grad.addColorStop(0.55, baseColor);
                        grad.addColorStop(1, baseColor);
                        
                        element.options.backgroundColor = grad;
                    } else if (status) {
                        element.options.backgroundColor = status.color;
                    }
                });
            }
        };

        if (pieChart) {
            pieChart.data.labels = labels;
            pieChart.data.datasets[0].data = dataValues;
            pieChart.options.plugins.tooltip.callbacks.label = (context) => ` ${tooltipLabels[context.dataIndex]}`;
            pieChart.sessionStatus = sessionStatus; 
            pieChart.update('none'); 
        } else {
            pieChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 0,
                        borderColor: 'transparent'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    layout: {
                        padding: 20
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            filter: function(tooltipItem) {
                                return tooltipLabels[tooltipItem.dataIndex] !== '';
                            },
                            callbacks: {
                                label: function(context) {
                                    return ` ${tooltipLabels[context.dataIndex]}`;
                                }
                            }
                        }
                    }
                },
                plugins: [clockLabelsPlugin, activeGradientPlugin]
            });
            pieChart.sessionStatus = sessionStatus;
        }

        // 애니메이션 루프 시작 (Active 세션이 있을 때만)
        const hasActive = sessionStatus.some(s => s.active);
        if (hasActive) {
            if (!animationFrameId) {
                const animate = () => {
                    if (pieChart) {
                        gradientOffset += 0.05; // 애니메이션 속도 조절
                        pieChart.draw();
                        animationFrameId = requestAnimationFrame(animate);
                    }
                };
                animationFrameId = requestAnimationFrame(animate);
            }
        } else {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            if (pieChart) pieChart.draw();
        }
    }
};

window.charts = charts;

