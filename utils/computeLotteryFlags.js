export function computeLotteryFlags(lottery) {
  const now = new Date();
  const ticketsSold = lottery.ticketsSold || 0;

  const hasStarted =
    now >= new Date(lottery.startDatetime) || ticketsSold >= lottery.maxTickets;
  const hasEnded =
    now >= new Date(lottery.endDatetime) || ticketsSold >= lottery.maxTickets;
  const resultReady = now >= new Date(lottery.drawDatetime);

  return {
    isActive: hasStarted,
    isEnded: hasEnded,
    resultAnnounced: resultReady,
  };
}
