let pieChart;

const charts = {
    renderDailyPie(sessions, baseDateStr) {
        const ctx = document.getElementById('daily-pie-chart').getContext('2d');
        
        if (pieChart) {
            pieChart.destroy();
        }

        const targetDateStr = baseDateStr || new Date().toLocaleDateString('en-CA');
        const dayStart = new Date(targetDateStr + 'T00:00:00').getTime();
        const dayEnd = new Date(targetDateStr + 'T23:59:59.999').getTime();

        const dataValues = [];
        const backgroundColors = [];
        const labels = [];
        const tooltipLabels = [];

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
            }

            // 공부 세션 조각
            const studyMins = (end - start) / 60000;
            if (studyMins > 0) {
                dataValues.push(studyMins);
                backgroundColors.push(session.color);
                labels.push(session.subject_name);
                tooltipLabels.push(`${session.subject_name}: ${Math.floor(studyMins)}분`);
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
                layout: {
                    padding: 20 // 바깥쪽 라벨을 위한 여백
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        filter: function(tooltipItem) {
                            return tooltipLabels[tooltipItem.dataIndex] !== ''; // 빈 시간은 툴팁 숨김
                        },
                        callbacks: {
                            label: function(context) {
                                return ` ${tooltipLabels[context.dataIndex]}`;
                            }
                        }
                    }
                }
            },
            plugins: [clockLabelsPlugin]
        });
    }
};

window.charts = charts;
